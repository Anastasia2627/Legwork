import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';

const merchant='legwork_mentor_integration_test',secret='test-only-wayforpay-merchant-secret-2026';
const signFields=['merchantAccount','orderReference','amount','currency','authCode','cardPan','transactionStatus','reasonCode'];
const randomPort=()=>new Promise(ok=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>ok(port))})});
const signed=(reference,amount,status='Approved')=>{
 const data={merchantAccount:merchant,orderReference:reference,amount,currency:'UAH',
  authCode:'Q12345',cardPan:'4111****1111',transactionStatus:status,reasonCode:'1100'};
 data.merchantSignature=crypto.createHmac('md5',secret).update(signFields.map(x=>String(data[x])).join(';')).digest('hex');
 return data;
};
test('Mentorship offer cannot charge without publication and provider approval; invoices are immutable',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-mentor-commerce-'));
 const port=await randomPort(),base='http://127.0.0.1:'+port;
 const adminPassword='mentorship-commerce-test-admin-pass-2026';
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{
  ...process.env,NODE_ENV:'test',PORT:String(port),SITE_ORIGIN:base,
  DATABASE_PATH:path.join(dir,'mentor.sqlite'),
  SESSION_SECRET:'mentorship-signed-quote-test-session-secret-1234',
  ADMIN_PASSWORD:adminPassword,PAYMENT_PROVIDER:'wayforpay',
  WAYFORPAY_MERCHANT_ACCOUNT:merchant,WAYFORPAY_SECRET_KEY:secret,
  WAYFORPAY_UAH_PER_USD:'42.50'
 },stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',chunk=>errors+=chunk.toString());
 const call=async(url,{cookie,method='GET',body}={})=>{
  const response=await fetch(base+url,{method,headers:{
   ...(cookie?{Cookie:cookie}:{}),
   ...(body?{'Content-Type':'application/json',Origin:base}:{})},
   body:body?JSON.stringify(body):undefined});
  return {code:response.status,data:await response.json().catch(()=>({})),
   cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 const create=(cookie,pack='Basic',video='https://example.org/private-dance')=>
  call('/api/mentorships',{cookie,method:'POST',body:{package:pack,video_url:video,goals:'Technique and transitions'}});
 try{
  let ready=false;for(let i=0;i<80;i++){
   try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
   await new Promise(ok=>setTimeout(ok,100));
  }
  assert.ok(ready,'Server did not start '+errors);
  const offers=await call('/api/mentorship/offers');
  assert.equal(offers.code,200);
  assert.equal(offers.data.offers.every(x=>!x.published&&x.price_usd_cents===null),true,
   'No test or production prices seeded');
  assert.equal((await call('/api/admin/mentorship/offers')).code,401);
  const student=await call('/api/auth/register',{method:'POST',
   body:{name:'Student A',email:'mentor-student@example.org',password:'MentorStudentStrongPassword#26'}});
  const stranger=await call('/api/auth/register',{method:'POST',
   body:{name:'Student B',email:'mentor-stranger@example.org',password:'MentorStrangerStrongPassword#26'}});
  const admin=await call('/api/auth/login',{method:'POST',body:{email:'admin',password:adminPassword}});
  assert.equal(student.code,200);assert.equal(stranger.code,200);assert.equal(admin.code,200);
  const user=student.cookie,other=stranger.cookie,staff=admin.cookie;
  assert.equal((await call('/api/admin/mentorship/offers',{cookie:user})).code,403);
  const unpublished=await create(user,'Deep');
  assert.equal(unpublished.code,201);
  assert.equal(unpublished.data.order_id,null);
  assert.equal(unpublished.data.quote,null);
  assert.equal((await call('/api/admin/mentorship/offers/Basic',{cookie:user,method:'PATCH',
   body:{published:true,price_usd_cents:2500,turnaround_business_days:7}})).code,403);
  assert.equal((await call('/api/admin/mentorship/offers/Basic',{cookie:staff,method:'PATCH',
   body:{published:true,price_usd_cents:null,turnaround_business_days:null}})).code,400);
  assert.equal((await call('/api/admin/mentorship/offers/Basic',{cookie:staff,method:'PATCH',
   body:{published:true,price_usd_cents:2500,turnaround_business_days:7}})).code,200);
  const created=await create(user,'Basic');
  assert.equal(created.code,201);
  assert.equal(created.data.quote.price_usd_cents,2500);
  assert.equal(created.data.quote.turnaround_business_days,7);
  assert.ok(created.data.order_id>0);
  const id=created.data.id,orderId=created.data.order_id;
  assert.equal((await call('/api/admin/mentorship/offers/Basic',{cookie:staff,method:'PATCH',
   body:{published:true,price_usd_cents:3900,turnaround_business_days:8}})).code,200);
  const dash=await call('/api/dashboard',{cookie:user});
  const req=dash.data.mentorships.find(x=>x.id===id);
  assert.equal(req.order_id,orderId);
  assert.equal(req.quoted_price_cents,2500,'Later catalog changes do not reprice pending request');
  assert.equal(req.turnaround_business_days,7,'Later editing cannot change promised time');
  assert.equal(dash.data.orders.find(x=>x.id===orderId).amount,2500);
  assert.equal((await call('/api/dashboard',{cookie:other})).data.mentorships.length,0);
  assert.equal((await call('/api/admin/orders/'+orderId+'/approve',{cookie:staff,method:'POST',body:{}})).code,409);
  assert.equal((await call('/api/orders/'+orderId+'/cancel',{cookie:user,method:'POST',body:{}})).code,409);
  assert.equal((await call('/api/mentorships/'+id+'/cancel',{cookie:other,method:'POST',body:{}})).code,404);
  const checkout=await call('/api/payments/checkout',{cookie:user,method:'POST',body:{order_ids:[orderId]}});
  assert.equal(checkout.code,201);
  assert.equal(checkout.data.price.usd_cents,2500);
  assert.equal(checkout.data.fields.amount,'1062.50');
  assert.match(checkout.data.fields['productName[]'][0],/mentorship/i);
  const ref=checkout.data.fields.orderReference,amount=checkout.data.fields.amount;
  assert.equal((await call('/api/mentorships/'+id+'/cancel',{cookie:user,method:'POST',body:{}})).code,409);
  assert.equal((await call('/api/admin/mentorships/'+id+'/verify-payment',{cookie:staff,method:'POST',body:{}})).code,409);
  assert.equal((await call('/api/payments/checkout',{cookie:user,method:'POST',body:{order_ids:[orderId]}})).code,409);
  const wrong=signed(ref,amount);wrong.merchantSignature='0'.repeat(32);
  assert.equal((await call('/api/payments/wayforpay/webhook',{method:'POST',body:wrong})).code,403);
  assert.equal((await call('/api/dashboard',{cookie:user})).data.mentorships.find(x=>x.id===id).status,'awaiting_payment');
  assert.equal((await call('/api/payments/wayforpay/webhook',{method:'POST',body:signed(ref,'0.01')})).code,409);
  assert.equal((await call('/api/payments/wayforpay/webhook',{method:'POST',body:signed(ref,amount)})).code,200);
  assert.equal((await call('/api/payments/wayforpay/webhook',{method:'POST',body:signed(ref,amount)})).code,200,
   'Duplicate provider notification acknowledged without duplicate fulfilment');
  assert.equal((await call('/api/dashboard',{cookie:user})).data.mentorships.find(x=>x.id===id).status,'paid');
  assert.equal((await call('/api/dashboard',{cookie:user})).data.orders.find(x=>x.id===orderId).status,'approved');
  assert.equal((await call('/api/admin/mentorships/'+id,{cookie:staff,method:'PATCH',body:{feedback:'Keep practising control'}})).code,200);
  assert.equal((await call('/api/payments/wayforpay/webhook',{method:'POST',body:signed(ref,amount,'Refunded')})).code,200);
  const mentorQueue=await call('/api/admin/mentorship-queue',{cookie:staff});
  assert.equal(mentorQueue.data.requests.find(x=>x.id===id).payment_review_required,1);
  assert.equal((await call('/api/admin/mentorships/'+id,{cookie:staff,method:'PATCH',
   body:{feedback:'Second reply after refund'}})).code,409);
  // Published offer can be unpublished without rewriting existing snapshots.
  assert.equal((await call('/api/admin/mentorship/offers/Basic',{cookie:staff,method:'PATCH',
   body:{published:false,price_usd_cents:null,turnaround_business_days:null}})).code,200);
  const next=await create(user,'Basic','https://example.org/second-video');
  assert.equal(next.code,201);
  assert.equal(next.data.order_id,null,'Unpublishing disables new automated quotes');
  const cancel=await call('/api/mentorships/'+next.data.id+'/cancel',{cookie:user,method:'POST',body:{}});
  assert.equal(cancel.code,200);
  assert.equal((await call('/api/admin/mentorships/'+unpublished.data.id+'/verify-payment',{cookie:staff,method:'POST',body:{}})).code,200,
   'Legacy manually negotiated requests still work');
 }finally{
  child.kill('SIGTERM');
  await new Promise(ok=>{if(child.exitCode!==null)return ok();child.once('exit',ok);setTimeout(ok,1500).unref()});
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:30000});
