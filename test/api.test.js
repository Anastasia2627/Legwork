import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

function randomPort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
async function request(base,route,{method='GET',data,cookie,origin}={}){
 const r=await fetch(base+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},body:data?JSON.stringify(data):undefined});
 let body;try{body=await r.json()}catch{body={}}return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
test('student isolation, order amount, reviews, admin rules and password rotation',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-api-'));
 const port=await randomPort(),base='http://127.0.0.1:'+port;
 const adminSecret='test-only-not-for-production-314159';
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'test',DATABASE_PATH:path.join(dir,'test.sqlite'),ADMIN_PASSWORD:adminSecret,SITE_ORIGIN:base},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
 try{
  let ready=false;for(let i=0;i<65;i++){try{const r=await fetch(base+'/health');if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
  assert.equal(ready,true,'API should launch. '+stderr);
  const catalog=await request(base,'/api/lessons');assert.equal(catalog.status,200);assert.equal(catalog.body.lessons.length,23);assert.equal('video_url' in catalog.body.lessons[0],false,'Public catalog must not reveal private URLs');
  assert.equal((await request(base,'/api/lessons/1/watch')).status,401,'Free lessons still require an account');
  const first=await request(base,'/api/auth/register',{method:'POST',data:{name:'Student 1',email:'one@example.org',password:'LongUniquePassword-123'}});
  assert.equal(first.status,200);const student=first.cookie;assert.ok(student?.includes('legwork_session='));
  assert.equal((await request(base,'/api/lessons/1/watch',{cookie:student})).status,200);
  assert.equal((await request(base,'/api/lessons/2/watch',{cookie:student})).status,403);
  assert.equal((await request(base,'/api/admin/overview',{cookie:student})).status,403);
  assert.equal((await request(base,'/api/admin/overview',{cookie:student,origin:'https://malicious.example'})).status,403);
  assert.equal((await request(base,'/api/orders',{method:'POST',cookie:student,origin:'invalid://',data:{kind:'course',item_id:1}})).status,403);
  const order=await request(base,'/api/orders',{method:'POST',cookie:student,data:{kind:'course',item_id:1,plan:'guru',amount:1}});
  assert.equal(order.status,201);assert.equal(order.body.amount,36000,'Client must not control price');
  assert.equal((await request(base,'/api/orders',{method:'POST',cookie:student,data:{kind:'course',item_id:1,plan:'guru'}})).status,409,'Duplicate pending requests rejected');
  assert.equal((await request(base,'/api/lessons/2/watch',{cookie:student})).status,403,'Request does not grant course access');
  const second=await request(base,'/api/auth/register',{method:'POST',data:{name:'Student 2',email:'two@example.org',password:'SecondPassword-12345'}});
  assert.equal(second.status,200);const stranger=second.cookie;
  const admin=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:adminSecret}});assert.equal(admin.status,200);const staff=admin.cookie;
  const deep=await request(base,'/api/mentorships',{method:'POST',cookie:student,data:{package:'Deep',video_url:'https://youtube.com/watch?v=abcdef12345',instagram:'@first',experience:'One year',goals:'Fluidity',training_frequency:'2-3 times a week',teaching:'No'}});assert.equal(deep.status,201);
  assert.equal((await request(base,'/api/admin/mentorships/'+deep.body.id,{method:'PATCH',cookie:student,data:{feedback:'Unauthorized'}})).status,403);
  assert.equal((await request(base,'/api/admin/mentorships/'+deep.body.id,{method:'PATCH',cookie:staff,data:{feedback:'Too early'}})).status,409,'Feedback must wait for payment verification');
  const overview=await request(base,'/api/admin/overview',{cookie:staff});assert.equal(overview.body.mentorships[0].training_frequency,'2-3 times a week');
  assert.equal((await request(base,'/api/admin/mentorships/'+deep.body.id+'/verify-payment',{method:'POST',cookie:staff})).status,200);
  assert.equal((await request(base,'/api/admin/mentorships/'+deep.body.id,{method:'PATCH',cookie:staff,data:{feedback:'Practice your lines'}})).status,200);
  const reviewed=await request(base,'/api/dashboard',{cookie:student});assert.equal(reviewed.body.mentorships[0].feedback,'Practice your lines');
  const changedCourse=await request(base,'/api/admin/courses/1',{method:'PATCH',cookie:staff,data:{title:'Legwork Lab',slug:'legwork-lab',description:'New overview',price:17000,guru_price:39000}});assert.equal(changedCourse.status,200);
  const newPricing=await request(base,'/api/courses');assert.equal(newPricing.body.courses[0].guru_price,39000);
  assert.equal((await request(base,'/api/admin/orders/'+order.body.id+'/approve',{method:'POST',cookie:student})).status,403);
  assert.equal((await request(base,'/api/admin/orders/'+order.body.id+'/approve',{method:'POST',cookie:staff})).status,200);
  assert.equal((await request(base,'/api/lessons/2/watch',{cookie:student})).status,200);
  assert.equal((await request(base,'/api/lessons/2/watch',{cookie:stranger})).status,403,'Other user cannot watch purchased course');
  const dash=await request(base,'/api/dashboard',{cookie:student});assert.equal(dash.body.enrollments[0].tier,'guru');
  const batch=await request(base,'/api/orders/batch',{method:'POST',cookie:stranger,data:{lesson_ids:[2,3]}});
  assert.equal(batch.status,201);assert.equal(batch.body.total,3000);assert.equal(batch.body.orders.length,2);
  assert.equal((await request(base,'/api/orders/batch',{method:'POST',cookie:stranger,data:{lesson_ids:[2,3]}})).status,409,'Cannot duplicate a pending cart');
  assert.equal((await request(base,'/api/orders/batch',{method:'POST',cookie:stranger,data:{lesson_ids:[4,9999]}})).status,409,'Invalid cart is rejected atomically');
  assert.equal((await request(base,'/api/lessons/2/watch',{cookie:stranger})).status,403,'Pending cart never grants access');
  const progress=await request(base,'/api/progress/2',{method:'POST',cookie:student,data:{completed:true,homework_url:'https://example.org/homework'}});assert.equal(progress.status,200);
  assert.equal((await request(base,'/api/account/activity',{method:'POST',cookie:stranger,data:{lesson_id:2}})).status,403);
  assert.equal((await request(base,'/api/account/activity',{method:'POST',cookie:student,data:{lesson_id:2}})).status,200);
  const hw=await request(base,'/api/admin/homework',{cookie:staff});assert.equal(hw.status,200);assert.equal(hw.body.homework.length,1);
  const feedback=await request(base,'/api/admin/homework/2/2/review',{method:'POST',cookie:staff,data:{feedback:'Good technique'}});assert.equal(feedback.status,200);
  const ownReview=await request(base,'/api/account/homework-reviews',{cookie:student});assert.equal(ownReview.body.reviews.length,1);
  const otherReview=await request(base,'/api/account/homework-reviews',{cookie:stranger});assert.equal(otherReview.body.reviews.length,0);
  const badge=await request(base,'/api/account/achievements',{cookie:student});assert.equal(badge.body.badges.length,1);assert.equal(badge.body.streak,1);
  const change=await request(base,'/api/account/change-password',{method:'POST',cookie:student,data:{current_password:'LongUniquePassword-123',new_password:'ChangedPassword-45678'}});assert.equal(change.status,200);
  assert.equal((await request(base,'/api/dashboard',{cookie:student})).status,401,'Old sessions must be revoked');
  assert.equal((await request(base,'/api/auth/login',{method:'POST',data:{email:'one@example.org',password:'LongUniquePassword-123'}})).status,401);
  assert.equal((await request(base,'/api/auth/login',{method:'POST',data:{email:'one@example.org',password:'ChangedPassword-45678'}})).status,200);
 }finally{child.kill('SIGTERM');await rm(dir,{recursive:true,force:true})}
},{timeout:18000});
