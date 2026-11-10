import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

// The listening port must be sampled before close.
async function freePort(){
 return await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port))})});
}
async function request(base,uri,{cookie,method='GET',data}={}){
 const response=await fetch(base+uri,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 const body=await response.json().catch(()=>({}));
 return {status:response.status,body,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function findMessage(file,match){
 for(let i=0;i<80;i++){
  try{
   const entries=(await readFile(file,'utf8')).trim().split('\n').filter(Boolean).map(v=>JSON.parse(v));
   const found=entries.find(e=>match(e));if(found)return found;
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,75));
 }
 throw Error('Expected test email was not delivered');
}
test('Independent marketing opt-ins, unsubscribe, and safe cancellation of unpaid requests',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-final-flows-'));
 const mailFile=path.join(dir,'outbox.jsonl'),dbPath=path.join(dir,'test.sqlite'),port=await freePort(),base='http://127.0.0.1:'+port;
 const adminPassword='test-only-strong-secret-for-flows-6630';
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'test',SITE_ORIGIN:base,DATABASE_PATH:dbPath,SESSION_SECRET:'unique-marketing-and-flows-test-key-2026-2048',ADMIN_PASSWORD:adminPassword,MAIL_TEST_OUTBOX_PATH:mailFile,PAYMENT_PROVIDER:'disabled'},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',part=>stderr+=part.toString());
 try{
  let ready=false;
  for(let i=0;i<90;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break}catch{}await new Promise(resolve=>setTimeout(resolve,75))}
  assert.equal(ready,true,'Test server did not start: '+stderr);
  const email='flows-user@example.org';
  assert.equal((await request(base,'/api/subscribe',{method:'POST',data:{email,purpose:'newsletter',consent:false}})).status,400);
  assert.equal((await request(base,'/api/subscribe',{method:'POST',data:{email,purpose:'unknown',consent:true}})).status,400);
  const newsletter=await request(base,'/api/subscribe',{method:'POST',data:{email,purpose:'newsletter',consent:true}});
  assert.equal(newsletter.status,200);
  assert.equal(newsletter.body.delivery_enabled,true);
  assert.equal((await request(base,'/api/subscribe',{method:'POST',data:{email,purpose:'free-lesson',consent:true}})).status,200);
  assert.equal((await request(base,'/api/subscribe',{method:'POST',data:{email,purpose:'newsletter',consent:true}})).status,200);
  const admin=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:adminPassword}});
  assert.equal(admin.status,200);
  assert.equal((await request(base,'/api/admin/waitlist')).status,401);
  const before=await request(base,'/api/admin/waitlist',{cookie:admin.cookie});
  assert.equal(before.status,200);
  assert.equal(before.body.entries.filter(e=>e.email===email).length,2,'Newsletter and free-lesson consents must be separate');
  const receipt=await findMessage(mailFile,e=>e.to===email&&e.subject.includes('Subscription preference saved')&&e.text.includes('school news'));
  const token=receipt.text.match(/#\/unsubscribe\/([a-f0-9]{64})/)?.[1];assert.ok(token);
  assert.equal((await request(base,'/api/subscriptions/unsubscribe',{method:'POST',data:{token:'bad'}})).status,400);
  const gone=await request(base,'/api/subscriptions/unsubscribe',{method:'POST',data:{token}});
  assert.equal(gone.status,200);
  assert.equal((await request(base,'/api/subscriptions/unsubscribe',{method:'POST',data:{token}})).status,200,'Unsubscribe must be idempotent');
  const after=await request(base,'/api/admin/waitlist',{cookie:admin.cookie});
  assert.deepEqual(after.body.entries.filter(e=>e.email===email).map(e=>e.purpose),['free-lesson']);
  const registration=await request(base,'/api/auth/register',{method:'POST',data:{email,name:'Test Student',password:'UniqueStudentPassword-9876'}});
  assert.equal(registration.status,200);
  const studentCookie=registration.cookie;
  const verifyEmail=await findMessage(mailFile,e=>e.to===email&&e.subject.includes('Verify your email'));
  const verificationToken=verifyEmail.text.match(/#\/verify-email\/([a-f0-9]{64})/)?.[1];assert.ok(verificationToken);
  assert.equal((await request(base,'/api/auth/verify-email',{method:'POST',data:{token:verificationToken}})).status,200);
  const order=await request(base,'/api/orders',{cookie:studentCookie,method:'POST',data:{kind:'course',item_id:1,plan:'self'}});
  assert.equal(order.status,201);
  const other=await request(base,'/api/auth/register',{method:'POST',data:{name:'Other Student',email:'another-flows-user@example.org',password:'AnotherPassword-9876'}});
  assert.equal((await request(base,'/api/orders/'+order.body.id+'/cancel',{cookie:other.cookie,method:'POST',data:{}})).status,404);
  const cancel=await request(base,'/api/orders/'+order.body.id+'/cancel',{cookie:studentCookie,method:'POST',data:{}});
  assert.equal(cancel.status,200);
  assert.equal((await request(base,'/api/orders/'+order.body.id+'/cancel',{cookie:studentCookie,method:'POST',data:{}})).status,409);
  const newOrder=await request(base,'/api/orders',{cookie:studentCookie,method:'POST',data:{kind:'course',item_id:1}});
  assert.equal(newOrder.status,201,'Cancelled order must not block a fresh request');
  const mentor=await request(base,'/api/mentorships',{cookie:studentCookie,method:'POST',data:{package:'Basic',video_url:'https://example.org/dance-clip',goals:'Leg lines'}});
  assert.equal(mentor.status,201);
  const mentorId=mentor.body.id;
  assert.equal((await request(base,'/api/mentorships/'+mentorId+'/cancel',{cookie:other.cookie,method:'POST',data:{}})).status,404);
  assert.equal((await request(base,'/api/mentorships/'+mentorId+'/cancel',{cookie:studentCookie,method:'POST',data:{}})).status,200);
  assert.equal((await request(base,'/api/admin/mentorships/'+mentorId+'/verify-payment',{cookie:admin.cookie,method:'POST',data:{}})).status,409);
  // In-flight processor invoices must not be cancelled or manually approved.
  const live=new Database(dbPath);
  try{
   const userId=live.prepare('SELECT id FROM users WHERE email=?').get(email).id;
   const amount=live.prepare('SELECT amount FROM orders WHERE id=?').get(newOrder.body.id).amount;
   const pa=live.prepare('INSERT INTO payment_attempts(user_id,provider,reference,usd_cents,uah_kopecks,rate_x100,status) VALUES(?,?,?,?,?,?,?)').run(userId,'wayforpay','LGW-'+crypto.randomUUID(),amount,amount*40,4000,'pending');
   live.prepare('INSERT INTO payment_attempt_orders(attempt_id,order_id,amount_usd_cents) VALUES(?,?,?)').run(pa.lastInsertRowid,newOrder.body.id,amount);
  }finally{live.close()}
  assert.equal((await request(base,'/api/orders/'+newOrder.body.id+'/cancel',{cookie:studentCookie,method:'POST',data:{}})).status,409);
  assert.equal((await request(base,'/api/admin/orders/'+newOrder.body.id+'/approve',{cookie:admin.cookie,method:'POST',data:{}})).status,409);
  const dashboard=await request(base,'/api/dashboard',{cookie:studentCookie});
  assert.equal(dashboard.body.orders.find(o=>o.id===newOrder.body.id).status,'pending','Blocked cancellation must not mutate order');
  assert.equal(dashboard.body.mentorships.find(m=>m.id===mentorId).status,'cancelled');
 }finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>setTimeout(resolve,120));
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:45000});
