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
test('Draft courses stay private until an authenticated administrator publishes complete materials',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-publish-'));
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
  const studentLogin=await request('/api/auth/register',{method:'POST',data:{name:'Student',email:'publish-student@example.org',password:'UniqueStudentPassword-2026'}});
  assert.equal(studentLogin.status,200);const student=studentLogin.cookie;

  const created=await request('/api/admin/courses',{method:'POST',cookie:admin,data:{title:'Draft course',slug:'draft-course-test',description:'',price:1200,guru_price:2000,draft:true}});
  assert.equal(created.status,201);
  assert.equal(created.body.active,0);
  const id=created.body.id,publish='/api/admin/courses/'+id+'/publish';
  const hidden=async()=>{
   assert.equal((await request('/api/courses')).body.courses.some(c=>c.id===id),false);
   assert.equal((await request('/api/lessons')).body.lessons.some(l=>l.course_id===id),false);
  };
  await hidden();
  assert.equal((await request(publish,{method:'POST',data:{confirm:true}})).status,401);
  assert.equal((await request(publish,{method:'POST',cookie:student,data:{confirm:true}})).status,403);
  assert.equal((await request(publish,{method:'POST',cookie:admin,data:{confirm:false}})).status,400);
  assert.equal((await request(publish,{method:'POST',cookie:admin,data:{confirm:true}})).status,409);
  const lesson=await request('/api/admin/lessons',{method:'POST',cookie:admin,data:{title:'Private draft lesson',course_id:id,price:1200,free:true}});
  assert.equal(lesson.status,201);
  const lid=lesson.body.id;
  await hidden();
  assert.equal((await request('/api/lessons/'+lid+'/watch',{cookie:student})).status,403);
  assert.equal((await request('/api/learning/'+lid,{cookie:student})).status,404);
  assert.equal((await request('/api/progress/'+lid,{method:'POST',cookie:student,data:{completed:true}})).status,403);
  assert.equal((await request('/api/account/activity',{method:'POST',cookie:student,data:{lesson_id:lid}})).status,404);
  const overview=await request('/api/admin/overview',{cookie:admin});
  const uid=overview.body.users.find(u=>u.email==='publish-student@example.org').id;
  assert.equal((await request('/api/admin/enroll',{method:'POST',cookie:admin,data:{user_id:uid,course_id:id}})).status,404);
  const existing=(await request('/api/lessons')).body.lessons[0];
  assert.equal((await request('/api/admin/bundles',{method:'POST',cookie:admin,data:{title:'Unavailable bundle',slug:'unavailable-bundle',direction:'Legwork',price:1000,original_price:2000,lesson_ids:[lid,existing.id]}})).status,400);
  assert.equal((await request('/api/admin/courses/'+id,{method:'PATCH',cookie:admin,data:{description:'Course description'}})).status,200);
  const missing=await request(publish,{method:'POST',cookie:admin,data:{confirm:true}});
  assert.equal(missing.status,409);
  assert.deepEqual(missing.body.missing_lesson_ids,[lid]);
  assert.equal((await request('/api/admin/lessons/'+lid+'/full',{method:'PATCH',cookie:admin,data:{video_url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',cover_url:'https://example.org/cover.webp'}})).status,200);
  const published=await request(publish,{method:'POST',cookie:admin,data:{confirm:true}});
  assert.equal(published.status,200);
  assert.equal(published.body.already_published,false);
  assert.equal((await request('/api/courses')).body.courses.some(c=>c.id===id),true);
  const row=(await request('/api/lessons')).body.lessons.find(l=>l.id===lid);
  assert.ok(row);
  assert.equal('video_url' in row,false);
  assert.equal((await request('/api/lessons/'+lid+'/watch',{cookie:student})).status,200);
  assert.equal((await request(publish,{method:'POST',cookie:admin,data:{confirm:true}})).body.already_published,true);
 }finally{
  child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:45000});
