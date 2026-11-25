import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

async function port(){
 return new Promise((resolve,reject)=>{
  const socket=net.createServer();
  socket.once('error',reject);
  socket.listen(0,'127.0.0.1',()=>{const value=socket.address().port;socket.close(()=>resolve(value))});
 });
}
test('Bulk lesson edits are authorized, allowlisted, atomic and preserve unrelated fields',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-lesson-bulk-'));
 const number=await port(),base='http://127.0.0.1:'+number;
 const adminPassword='test-only-course-order-password-2026';
 const child=spawn(process.execPath,['server.js'],{
  cwd:process.cwd(),
  env:{...process.env,NODE_ENV:'test',PORT:String(number),DATABASE_PATH:path.join(dir,'order.sqlite'),
   ADMIN_PASSWORD:adminPassword,SITE_ORIGIN:base},
  stdio:['ignore','pipe','pipe']
 });
 let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
 const request=async(route,{method='GET',cookie,data}={})=>{
  const r=await fetch(base+route,{method,headers:{
   ...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})
  },body:data?JSON.stringify(data):undefined});
  let body;try{body=await r.json()}catch{body=null}
  return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};
 };
 try{
  let ready=false;
  for(let i=0;i<80;i++){
   try{if((await request('/health')).status===200){ready=true;break}}catch{}
   await new Promise(done=>setTimeout(done,100));
  }
  assert.ok(ready,stderr);
  const adminLogin=await request('/api/auth/login',{method:'POST',data:{email:'Admin',password:adminPassword}});
  assert.equal(adminLogin.status,200);const admin=adminLogin.cookie;
  const studentLogin=await request('/api/auth/register',{method:'POST',data:{name:'Student',email:'bulk-student@example.org',password:'UniqueStudentPassword-2026'}});
  assert.equal(studentLogin.status,200);const student=studentLogin.cookie;



  const course=(await request('/api/courses')).body.courses.find(c=>c.slug==='legwork-lab');
  const create=async(title,ready)=>request('/api/admin/lessons',{method:'POST',cookie:admin,data:{title,course_id:course.id,price:1234,draft:true,...(ready?{video_url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',cover_url:'https://example.org/cover.webp'}:{})}});
  const a=await create('Bulk ready',true),b=await create('Bulk incomplete',false);
  assert.equal(a.status,201);assert.equal(b.status,201);
  const ids=[a.body.id,b.body.id];
  const bulk=(data,cookie=admin)=>request('/api/admin/lessons/bulk',{method:'POST',cookie,data});
  const rows=async()=>(await request('/api/admin/overview',{cookie:admin})).body.lessons.filter(l=>ids.includes(l.id));
  const original=await rows();
  const payload={lesson_ids:ids,changes:{price:1999,level:'Advanced'},publish:true,confirm:true};
  assert.equal((await bulk(payload,student)).status,403);
  assert.equal((await request('/api/admin/lessons/bulk',{method:'POST',data:payload})).status,401);
  for(const invalid of [{confirm:false},{lesson_ids:[ids[0],ids[0]]},{lesson_ids:Array.from({length:51},(_,i)=>i+1)},{changes:{price:-1}},{changes:{price:'100'}},{changes:{title:'Not allowed'}},{changes:{free:true}},{changes:{sort_order:1}},{changes:{video_url:'https://example.org'}},{changes:{category:'   '}},{changes:{level:7}},{publish:'true'}]){
   assert.equal((await bulk({...payload,...invalid})).status,400);
  }
  assert.equal((await bulk({...payload,lesson_ids:[ids[0],99999999]})).status,404);
  const blocked=await bulk(payload);
  assert.equal(blocked.status,409);
  assert.deepEqual(blocked.body.lesson_ids,[ids[1]]);
  assert.deepEqual(await rows(),original);
  const edited=await bulk({...payload,publish:false,changes:{price:0,level:'Advanced',equipment:'Mat'}});
  assert.equal(edited.status,200);assert.equal(edited.body.updated,2);assert.equal(edited.body.published,0);
  for(const row of await rows()){
   const prior=original.find(l=>l.id===row.id);
   assert.deepEqual(row,{...prior,price:0,level:'Advanced',equipment:'Mat'});
  }
  assert.equal((await request('/api/admin/lessons/'+ids[1]+'/full',{method:'PATCH',cookie:admin,data:{video_url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',cover_url:'https://example.org/cover.webp'}})).status,200);
  const published=await bulk({lesson_ids:ids,changes:{},publish:true,confirm:true});
  assert.equal(published.status,200);assert.equal(published.body.updated,0);assert.equal(published.body.published,2);
  const listed=(await request('/api/lessons')).body.lessons.filter(l=>ids.includes(l.id));
  assert.equal(listed.length,2);assert.equal(listed.some(l=>'video_url' in l),false);
  assert.equal((await bulk({lesson_ids:ids,changes:{},publish:true,confirm:true})).body.published,0);
 }finally{
  child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:45000});
