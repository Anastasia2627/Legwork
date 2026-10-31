import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';

const merchant='legwork_test_merchant',secret='temporary-test-signing-key-never-live';
const fields=['merchantAccount','orderReference','amount','currency','authCode','cardPan','transactionStatus','reasonCode'];
const sign=data=>crypto.createHmac('md5',secret).update(fields.map(k=>String(data[k]??'')).join(';')).digest('hex');
const response=async(base,route,{method='GET',data,cookie,origin}={})=>{
 const r=await fetch(base+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},body:data?JSON.stringify(data):undefined});
 let body;try{body=await r.json()}catch{body={}};
 return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};
};
const randomPort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})});
const callback=(reference,amount='6800.00',transactionStatus='Approved',overrides={})=>{
 const payload={merchantAccount:merchant,orderReference:reference,amount,currency:'UAH',authCode:'12345',cardPan:'4111****1111',transactionStatus,reasonCode:'1100',...overrides};
 payload.merchantSignature=sign(payload);return payload;
};

test('Payment request signature uses documented field order and UTF-8 HMAC-MD5',()=>{
 const values=['test_merchant','www.market.ua','DH783023','1415379863','1547.36','UAH','Процесор Intel Core i5-4670 3.4GHz','Пам\u0027ять Kingston DDR3-1600 4096MB PC3-12800','1','1','1000','547.36'];
 const hash=crypto.createHmac('md5','dhkq3vUi94{Z!5frxs(02ML').update(values.join(';')).digest('hex');
 // This example is copied from the public payment provider documentation.
 assert.equal(hash,'4941ea0c7f5b4833c2bd06b1fefcdc0b');
});
test('Payment approval requires authentic matching signed callback and is idempotent',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-payments-'));
 const port=await randomPort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'test',SITE_ORIGIN:base,DATABASE_PATH:path.join(dir,'payments.sqlite'),ADMIN_PASSWORD:'AnotherUniqueTestAdminPassword-12345',SESSION_SECRET:'payment-test-session-hmac-key-local-only-12345',PAYMENT_PROVIDER:'wayforpay',WAYFORPAY_MERCHANT_ACCOUNT:merchant,WAYFORPAY_SECRET_KEY:secret,WAYFORPAY_UAH_PER_USD:'42.50'},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
 try{
  let up=false;for(let t=0;t<65;t++){try{up=(await fetch(base+'/health')).ok;if(up)break}catch{}await new Promise(r=>setTimeout(r,100))}
  assert.equal(up,true,stderr);
  const cfg=await response(base,'/api/payments/config');assert.equal(cfg.status,200);assert.equal(cfg.body.enabled,true);
  const student=await response(base,'/api/auth/register',{method:'POST',data:{name:'Paying dancer',email:'pay@example.org',password:'StrongUniqueTestPassword#1234'}});assert.equal(student.status,200);
  const cookie=student.cookie;
  const stranger=await response(base,'/api/auth/register',{method:'POST',data:{name:'Other dancer',email:'other@example.org',password:'AnotherStrongPassword#1234'}});assert.equal(stranger.status,200);
  assert.equal((await response(base,'/api/lessons/2/watch',{cookie})).status,403);
  const order=await response(base,'/api/orders',{method:'POST',cookie,data:{kind:'course',item_id:1}});assert.equal(order.status,201);
  const checkout=await response(base,'/api/payments/checkout',{method:'POST',cookie,data:{order_ids:[order.body.id]}});assert.equal(checkout.status,201);
  const ref=checkout.body.fields.orderReference,attempt=checkout.body.attempt_id;
  assert.equal(checkout.body.fields.amount,'6800.00');assert.equal(checkout.body.fields.currency,'UAH');
  assert.equal(checkout.body.price.usd_cents,16000);
  assert.equal(checkout.body.url,'https://secure.wayforpay.com/pay');
  assert.equal(checkout.body.fields.serviceUrl,base+'/api/payments/wayforpay/webhook');
  assert.equal(checkout.body.fields.merchantSignature.length,32);
  assert.equal(JSON.stringify(checkout.body).includes(secret),false);
  const resumed=await response(base,'/api/payments/continue',{method:'POST',cookie,data:{attempt_id:attempt}});
  assert.equal(resumed.status,200);
  assert.equal(resumed.body.fields.orderReference,ref);
  assert.equal(resumed.body.fields.orderDate,checkout.body.fields.orderDate);
  assert.equal(resumed.body.fields.merchantSignature,checkout.body.fields.merchantSignature);
  assert.equal(resumed.body.price.uah_kopecks,checkout.body.price.uah_kopecks);
  const ownedAttempts=await response(base,'/api/payments/mine',{cookie});
  assert.equal(ownedAttempts.body.payments.length,1,'Continuing does not create a second charge attempt');
  assert.equal((await response(base,'/api/payments/mine',{cookie:stranger.cookie})).body.payments.length,0);
  assert.equal((await response(base,'/api/payments/continue',{method:'POST',cookie:stranger.cookie,data:{attempt_id:attempt}})).status,404);

  assert.equal((await response(base,'/api/payments/checkout',{method:'POST',cookie,data:{order_ids:[order.body.id]}})).status,409,'Second attempt for pending order is blocked');
  assert.equal((await response(base,'/api/payments/status/'+attempt,{cookie:stranger.cookie})).status,403,'Other student cannot read payment state');
  assert.equal((await response(base,'/api/payments/status/'+attempt)).status,401);
  const forged=callback(ref);forged.merchantSignature='0'.repeat(32);
  assert.equal((await response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:forged})).status,403);
  assert.equal((await response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:callback(ref,'0.01')})).status,409,'Correctly signed wrong amount cannot unlock courses');
  assert.equal((await response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:callback(ref,'6800.00','Approved',{currency:'USD'})})).status,409,'Wrong currency rejected');
  assert.equal((await response(base,'/api/lessons/2/watch',{cookie})).status,403);
  assert.equal((await response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:callback(ref,'6800.00','Pending')})).status,200);
  assert.equal((await response(base,'/api/payments/status/'+attempt,{cookie})).body.payment.status,'pending');
  const approved=await response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:callback(ref)});
  assert.equal(approved.status,200);assert.equal(approved.body.status,'accept');assert.equal(approved.body.signature.length,32);
  assert.equal((await response(base,'/api/lessons/2/watch',{cookie})).status,200,'Signed approval unlocks lessons');
  const status=await response(base,'/api/payments/status/'+attempt,{cookie});assert.equal(status.body.payment.status,'approved');
  assert.equal((await response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:callback(ref)})).status,200,'Duplicated callback is safely acknowledged');
  assert.equal((await response(base,'/api/payments/status/'+attempt,{cookie})).body.payment.status,'approved');
  assert.equal((await response(base,'/api/payments/checkout',{method:'POST',cookie,data:{order_ids:[order.body.id]}})).status,409,'Paid orders cannot be charged again');
  assert.equal((await response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:callback(ref,'6800.00','Declined')})).status,200);
  assert.equal((await response(base,'/api/payments/status/'+attempt,{cookie})).body.payment.status,'approved','Late decline cannot reverse confirmed payment');
  const refunded=await response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:callback(ref,'6800.00','Refunded')});
  assert.equal(refunded.status,200);
  assert.equal((await response(base,'/api/payments/status/'+attempt,{cookie})).body.payment.status,'review_required','Refund triggers a staff review');
  assert.equal((await response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:callback(ref)})).status,200);
  assert.equal((await response(base,'/api/payments/status/'+attempt,{cookie})).body.payment.status,'review_required','Late approval must not hide a refund');

  const nextOrder=await response(base,'/api/orders',{method:'POST',cookie:stranger.cookie,data:{kind:'lesson',item_id:23}});assert.equal(nextOrder.status,201);
  const second=await response(base,'/api/payments/checkout',{method:'POST',cookie:stranger.cookie,data:{order_ids:[nextOrder.body.id]}});assert.equal(second.status,201);
  assert.equal((await response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:callback(second.body.fields.orderReference,second.body.fields.amount,'Declined')})).status,200);
  assert.equal((await response(base,'/api/payments/status/'+second.body.attempt_id,{cookie:stranger.cookie})).body.payment.status,'declined');
  assert.equal((await response(base,'/api/lessons/23/watch',{cookie:stranger.cookie})).status,403,'Declined payment never unlocks the lesson');
  const staff=await response(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:'AnotherUniqueTestAdminPassword-12345'}});
  assert.equal(staff.status,200);
  const ledger=await response(base,'/api/admin/payments',{cookie:staff.cookie});assert.equal(ledger.status,200);assert.equal(ledger.body.payments.length,2);
  assert.equal((await response(base,'/api/admin/payments',{cookie})).status,403);
 }finally{child.kill('SIGTERM');await rm(dir,{recursive:true,force:true})}
},{timeout:20000});
