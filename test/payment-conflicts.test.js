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

test('Overlapping purchases, late approvals and review-required invoices cannot be retried',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-payment-conflicts-'));
 const port=await randomPort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'test',SITE_ORIGIN:base,DATABASE_PATH:path.join(dir,'payments.sqlite'),ADMIN_PASSWORD:'AnotherUniqueTestAdminPassword-12345',SESSION_SECRET:'payment-test-session-hmac-key-local-only-12345',PAYMENT_PROVIDER:'wayforpay',WAYFORPAY_MERCHANT_ACCOUNT:merchant,WAYFORPAY_SECRET_KEY:secret,WAYFORPAY_UAH_PER_USD:'42.50'},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
 try{
  let up=false;for(let t=0;t<65;t++){try{up=(await fetch(base+'/health')).ok;if(up)break}catch{}await new Promise(r=>setTimeout(r,100))}
  assert.equal(up,true,stderr);

  const student=await response(base,'/api/auth/register',{method:'POST',data:{name:'Payment test',email:'conflict@example.org',password:'StrongUniqueTestPassword#1234'}});
  assert.equal(student.status,200);
  const cookie=student.cookie;
  const post=(route,data,session=cookie)=>response(base,route,{method:'POST',cookie:session,data});
  const checkout=ids=>post('/api/payments/checkout',{order_ids:ids});
  const status=async id=>(await response(base,'/api/payments/status/'+id,{cookie})).body.payment.status;
  const notify=(p,state)=>response(base,'/api/payments/wayforpay/webhook',{method:'POST',data:callback(p.fields.orderReference,p.fields.amount,state)});
  const admin=await post('/api/auth/login',{email:'Admin',password:'AnotherUniqueTestAdminPassword-12345'});
  assert.equal(admin.status,200);
  assert.equal((await post('/api/orders',{kind:'course',item_id:1,plan:'unknown'})).status,400);
  const course=await post('/api/orders',{kind:'course',item_id:1,plan:'self'});
  const guru=await post('/api/orders',{kind:'course',item_id:1,plan:'guru'});
  const lesson=await post('/api/orders',{kind:'lesson',item_id:2});
  assert.equal(course.status,201);assert.equal(guru.status,201);assert.equal(lesson.status,201);
  assert.equal((await checkout([course.body.id,lesson.body.id])).status,409);
  assert.equal((await checkout([course.body.id,guru.body.id])).status,409);
  const first=await checkout([course.body.id]);
  assert.equal(first.status,201);
  assert.equal((await checkout([lesson.body.id])).status,409);
  assert.equal((await post('/api/admin/orders/'+lesson.body.id+'/approve',{},admin.cookie)).status,409);
  assert.equal((await notify(first.body,'Declined')).status,200);
  const second=await checkout([course.body.id]);
  assert.equal(second.status,201);
  assert.equal((await notify(first.body,'Approved')).status,200);
  assert.equal(await status(first.body.attempt_id),'approved');
  assert.equal(await status(second.body.attempt_id),'review_required');
  assert.equal((await response(base,'/api/lessons/2/watch',{cookie})).status,200);
  assert.equal((await post('/api/payments/continue',{attempt_id:second.body.attempt_id})).status,409);
  assert.equal((await notify(second.body,'Approved')).status,200);
  assert.equal(await status(second.body.attempt_id),'review_required');
  assert.equal((await checkout([guru.body.id])).status,409);
  const history=await response(base,'/api/payments/mine',{cookie});
  assert.ok(history.body.payments.some(p=>p.id===second.body.attempt_id&&p.order_ids.includes(course.body.id)));
  // The second buyer's refunded/voided pending invoice is held even if no access was granted.
  const other=await post('/api/auth/register',{name:'Other',email:'review@example.org',password:'StrongUniqueTestPassword#1234'});
  const item=await post('/api/orders',{kind:'lesson',item_id:3},other.cookie);
  const held=await post('/api/payments/checkout',{order_ids:[item.body.id]},other.cookie);
  assert.equal(held.status,201);
  assert.equal((await notify(held.body,'Voided')).status,200);
  assert.equal((await post('/api/payments/checkout',{order_ids:[item.body.id]},other.cookie)).status,409);
 }finally{
  child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:45000});
