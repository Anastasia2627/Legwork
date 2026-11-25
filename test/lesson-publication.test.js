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
test('Draft lessons do not enter a published course syllabus or entitlement checks until publication',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-lesson-publish-'));
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
  const studentLogin=await request('/api/auth/register',{method:'POST',data:{name:'Student',email:'lesson-publish-student@example.org',password:'UniqueStudentPassword-2026'}});
  assert.equal(studentLogin.status,200);const student=studentLogin.cookie;


  const course=(await request('/api/courses')).body.courses.find(c=>c.slug==='legwork-lab');
  const original=(await request('/api/lessons')).body.lessons.filter(l=>l.course_id===course.id);
  const overview=await request('/api/admin/overview',{cookie:admin});
  const uid=overview.body.users.find(u=>u.email==='lesson-publish-student@example.org').id;
  assert.equal((await request('/api/admin/enroll',{method:'POST',cookie:admin,data:{user_id:uid,course_id:course.id,tier:'guru'}})).status,200);
  const before=(await request('/api/account/certificates',{cookie:student})).body.certificates.find(c=>c.course_id===course.id);
  assert.equal(before.total,original.length);
  const created=await request('/api/admin/lessons',{method:'POST',cookie:admin,data:{title:'Draft unpublished lesson',course_id:course.id,price:1200,free:true,draft:true}});
  assert.equal(created.status,201);
  assert.equal(created.body.published,0);
  const lid=created.body.id,publish='/api/admin/lessons/'+lid+'/publish';
  const list=async()=>(await request('/api/lessons')).body.lessons.filter(l=>l.course_id===course.id);
  assert.equal((await list()).length,original.length);
  assert.equal((await request('/api/lessons/'+lid+'/watch',{cookie:student})).status,403);
  assert.equal((await request('/api/learning/'+lid,{cookie:student})).status,404);
  assert.equal((await request('/api/learning/'+lid+'/materials',{cookie:student})).status,403);
  assert.equal((await request('/api/progress/'+lid,{method:'POST',cookie:student,data:{completed:true}})).status,403);
  assert.equal((await request('/api/account/activity',{method:'POST',cookie:student,data:{lesson_id:lid}})).status,404);
  const study=await request('/api/learning/'+original[0].id,{cookie:student});
  assert.equal(study.status,200);
  assert.equal(study.body.syllabus.some(l=>l.id===lid),false);
  assert.equal((await request('/api/learning/'+lid,{cookie:admin})).status,200);
  const pending=(await request('/api/account/certificates',{cookie:student})).body.certificates.find(c=>c.course_id===course.id);
  assert.equal(pending.total,before.total);
  assert.equal((await request('/api/admin/bundles',{method:'POST',cookie:admin,data:{title:'Draft bundle',slug:'draft-bundle-test',direction:'Legwork',price:1000,original_price:2000,lesson_ids:[lid,original[0].id]}})).status,400);
  assert.equal((await request(publish,{method:'POST',data:{confirm:true}})).status,401);
  assert.equal((await request(publish,{method:'POST',cookie:student,data:{confirm:true}})).status,403);
  assert.equal((await request(publish,{method:'POST',cookie:admin,data:{confirm:false}})).status,400);
  assert.equal((await request(publish,{method:'POST',cookie:admin,data:{confirm:true}})).status,409);
  assert.equal((await request('/api/admin/lessons/'+lid+'/full',{method:'PATCH',cookie:admin,data:{video_url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',cover_url:'https://example.org/cover.webp'}})).status,200);
  assert.equal((await list()).length,original.length);
  assert.equal((await request(publish,{method:'POST',cookie:admin,data:{confirm:true}})).status,200);
  const rows=await list();
  assert.equal(rows.length,original.length+1);
  assert.equal('video_url' in rows.find(l=>l.id===lid),false);
  assert.equal((await request('/api/lessons/'+lid+'/watch',{cookie:student})).status,200);
  assert.equal((await request('/api/learning/'+original[0].id,{cookie:student})).body.syllabus.some(l=>l.id===lid),true);
  assert.equal((await request('/api/account/certificates',{cookie:student})).body.certificates.find(c=>c.course_id===course.id).total,before.total+1);
  assert.equal((await request(publish,{method:'POST',cookie:admin,data:{confirm:true}})).body.already_published,true);
 }finally{
  child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:45000});
