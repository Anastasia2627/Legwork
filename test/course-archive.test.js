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
test('Archiving course sales preserves enrolled and individually purchased access',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-archive-'));
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
  const studentLogin=await request('/api/auth/register',{method:'POST',data:{name:'Student',email:'archive-student@example.org',password:'UniqueStudentPassword-2026'}});
  assert.equal(studentLogin.status,200);const student=studentLogin.cookie;



  const course=(await request('/api/courses')).body.courses.find(c=>c.slug==='legwork-lab');
  const cid=course.id,archive='/api/admin/courses/'+cid+'/archive',restore='/api/admin/courses/'+cid+'/restore';
  const lessons=(await request('/api/lessons')).body.lessons.filter(l=>l.course_id===cid);
  const free=lessons.find(l=>l.free),paid=lessons.filter(l=>!l.free);
  assert.ok(free&&paid.length>1);
  const buyer=(await request('/api/auth/register',{method:'POST',data:{name:'Buyer',email:'archive-buyer@example.org',password:'UniqueBuyerPassword-2026'}})).cookie;
  const outsider=(await request('/api/auth/register',{method:'POST',data:{name:'Outsider',email:'archive-outsider@example.org',password:'UniqueOutsiderPassword-2026'}})).cookie;
  const overview=await request('/api/admin/overview',{cookie:admin});
  const uid=overview.body.users.find(u=>u.email==='archive-student@example.org').id;
  assert.equal((await request('/api/admin/enroll',{method:'POST',cookie:admin,data:{user_id:uid,course_id:cid,tier:'guru'}})).status,200);
  const bundle=await request('/api/admin/bundles',{method:'POST',cookie:admin,data:{title:'Archive test bundle',slug:'archive-test-bundle',direction:'Legwork',price:1000,original_price:2000,lesson_ids:[paid[0].id,paid[1].id]}});
  assert.equal(bundle.status,201);
  const bundleOrder=await request('/api/orders/bundle',{method:'POST',cookie:outsider,data:{bundle_id:bundle.body.id}});
  assert.equal(bundleOrder.status,201);
  assert.equal((await request(archive,{method:'POST',cookie:admin,data:{confirm:true}})).status,409);
  assert.equal((await request('/api/orders/'+bundleOrder.body.id+'/cancel',{method:'POST',cookie:outsider,data:{}})).status,200);
  const order=await request('/api/orders',{method:'POST',cookie:buyer,data:{kind:'lesson',item_id:paid[0].id}});
  assert.equal(order.status,201);
  assert.equal((await request(archive,{method:'POST',cookie:admin,data:{confirm:true}})).status,409);
  assert.equal((await request('/api/admin/orders/'+order.body.id+'/approve',{method:'POST',cookie:admin,data:{}})).status,200);
  assert.equal((await request(archive,{method:'POST',cookie:student,data:{confirm:true}})).status,403);
  assert.equal((await request(archive,{method:'POST',cookie:admin,data:{confirm:false}})).status,400);
  assert.equal((await request(archive,{method:'POST',cookie:admin,data:{confirm:true}})).status,200);
  assert.equal((await request('/api/courses')).body.courses.some(c=>c.id===cid),false);
  assert.equal((await request('/api/lessons')).body.lessons.some(l=>l.course_id===cid),false);
  assert.equal((await request('/api/bundles')).body.bundles.some(b=>b.id===bundle.body.id),false);
  assert.equal((await request('/api/orders/bundle',{method:'POST',cookie:outsider,data:{bundle_id:bundle.body.id}})).status,404);
  assert.equal((await request('/api/orders',{method:'POST',cookie:outsider,data:{kind:'course',item_id:cid}})).status,404);
  assert.equal((await request('/api/lessons/'+free.id+'/watch',{cookie:outsider})).status,403);
  assert.equal((await request('/api/learning/'+paid[0].id,{cookie:student})).status,200);
  assert.equal((await request('/api/learning/'+paid[0].id,{cookie:buyer})).status,200);
  assert.equal((await request('/api/learning/'+paid[1].id,{cookie:buyer})).status,403);
  assert.equal((await request('/api/learning/'+free.id+'/materials',{cookie:student})).status,200);
  assert.equal((await request('/api/progress/'+paid[0].id,{method:'POST',cookie:student,data:{completed:true}})).status,200);
  assert.equal((await request('/api/account/activity',{method:'POST',cookie:student,data:{lesson_id:paid[0].id}})).status,200);
  const library=(await request('/api/dashboard',{cookie:student})).body.archived_lessons;
  assert.equal(library.length,lessons.length);
  assert.equal(library.some(l=>'video_url' in l),false);
  const individual=(await request('/api/dashboard',{cookie:buyer})).body.archived_lessons;
  assert.deepEqual(individual.map(l=>l.id),[paid[0].id]);
  assert.equal((await request('/api/dashboard',{cookie:outsider})).body.archived_lessons.length,0);
  assert.equal((await request('/api/account/certificates',{cookie:student})).body.certificates.find(c=>c.course_id===cid).total,lessons.length);
  assert.equal((await request(restore,{method:'POST',cookie:admin,data:{confirm:true}})).status,200);
  assert.equal((await request('/api/courses')).body.courses.some(c=>c.id===cid),true);
  assert.equal((await request('/api/bundles')).body.bundles.some(b=>b.id===bundle.body.id),true);
  assert.equal((await request('/api/lessons/'+free.id+'/watch',{cookie:outsider})).status,200);
  assert.equal((await request('/api/dashboard',{cookie:student})).body.archived_lessons.length,0);
 }finally{
  child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:45000});
