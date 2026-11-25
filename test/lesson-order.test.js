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
test('Admin reorders lessons atomically inside a course, without changing access or revealing videos',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-order-'));
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
  const studentLogin=await request('/api/auth/register',{method:'POST',data:{name:'Student',email:'order-student@example.org',password:'UniqueStudentPassword-2026'}});
  assert.equal(studentLogin.status,200);const student=studentLogin.cookie;
  const original=await request('/api/lessons');
  const courseOne=original.body.lessons.filter(l=>l.course_id===1);
  assert.ok(courseOne.length>2);
  assert.equal((await request('/api/admin/lessons/'+courseOne[1].id+'/reorder',{method:'POST',data:{direction:'up'}})).status,401);
  assert.equal((await request('/api/admin/lessons/'+courseOne[1].id+'/reorder',{method:'POST',cookie:student,data:{direction:'up'}})).status,403);
  for(const bad of ['sideways','',42,null]){
   assert.equal((await request('/api/admin/lessons/'+courseOne[1].id+'/reorder',{method:'POST',cookie:admin,data:{direction:bad}})).status,400);
  }
  assert.equal((await request('/api/admin/lessons/999999/reorder',{method:'POST',cookie:admin,data:{direction:'up'}})).status,404);
  const edge=await request('/api/admin/lessons/'+courseOne[0].id+'/reorder',{method:'POST',cookie:admin,data:{direction:'up'}});
  assert.equal(edge.status,200);
  assert.equal(edge.body.moved,false);

  // Add a separate course and make sure moving the first course never touches it.
  const newCourse=await request('/api/admin/courses',{method:'POST',cookie:admin,data:{title:'Side Course',slug:'side-course-order',description:'Other sequence',price:1200,guru_price:2000}});
  assert.equal(newCourse.status,201);
  const other=await request('/api/admin/lessons',{method:'POST',cookie:admin,
   data:{title:'Other Course Class',course_id:newCourse.body.id,price:1200,duration:12,sort_order:77}});
  assert.equal(other.status,201);

  // Equal legacy sort ranks are normalized when moving. No cross-course edits.
  const ranksBefore=await request('/api/admin/overview',{cookie:admin});
  const otherRank=ranksBefore.body.lessons.find(x=>x.id===other.body.id).sort_order;
  const moved=await request('/api/admin/lessons/'+courseOne[1].id+'/reorder',{method:'POST',cookie:admin,data:{direction:'up'}});
  assert.equal(moved.status,200);assert.equal(moved.body.moved,true);
  const after=await request('/api/lessons');
  const ordered=after.body.lessons.filter(x=>x.course_id===1);
  assert.deepEqual(ordered.slice(0,2).map(x=>x.id),[courseOne[1].id,courseOne[0].id]);
  assert.equal(after.body.lessons.find(x=>x.id===other.body.id).sort_order,otherRank);
  assert.equal('video_url' in ordered[0],false,'Public sorting must not leak paid video URLs');
  assert.equal((await request('/api/lessons/'+courseOne[1].id+'/watch',{cookie:student})).status,403,
   'Reordering does not grant access');

  const learning=await request('/api/learning/'+courseOne[0].id,{cookie:admin});
  assert.equal(learning.status,200);
  assert.deepEqual(learning.body.syllabus.slice(0,2).map(x=>x.id),[courseOne[1].id,courseOne[0].id]);

  const restored=await request('/api/admin/lessons/'+courseOne[1].id+'/reorder',{method:'POST',cookie:admin,data:{direction:'down'}});
  assert.equal(restored.status,200);assert.equal(restored.body.moved,true);
  const again=await request('/api/lessons');
  assert.deepEqual(again.body.lessons.filter(x=>x.course_id===1).slice(0,2).map(x=>x.id),courseOne.slice(0,2).map(x=>x.id));

  for(const bad of [null,'',1.5,-1,1000001,'not-a-rank']){
   const response=await request('/api/admin/lessons/'+courseOne[0].id+'/full',{method:'PATCH',cookie:admin,data:{sort_order:bad}});
   assert.equal(response.status,400,'Bad manual order rejected: '+String(bad));
  }
  const manual=await request('/api/admin/lessons/'+courseOne[0].id+'/full',{method:'PATCH',cookie:admin,data:{sort_order:999}});
  assert.equal(manual.status,200);
  const manualResult=await request('/api/lessons');
  assert.equal(manualResult.body.lessons.find(x=>x.id===courseOne[0].id).sort_order,999);
  assert.equal(manualResult.body.lessons.find(x=>x.id===other.body.id).sort_order,otherRank);
 }finally{
  child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:45000});
