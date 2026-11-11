import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

const port=()=>new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p))})});
const request=async(base,url,{cookie,method='GET',data,origin}={})=>{
 const response=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 return {status:response.status,body:await response.json().catch(()=>({})),headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]};
};
test('role and entitlement matrix denies cross-account access and stale or duplicate checkout',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-access-matrix-')),number=await port(),base='http://127.0.0.1:'+number;
 const adminPassword='Access-Matrix-Admin-Password-2026';
 const env={
  ...process.env,PORT:String(number),NODE_ENV:'test',SITE_ORIGIN:base,
  DATABASE_PATH:path.join(dir,'test.sqlite'),SESSION_SECRET:'legwork-access-test-unique-session-secret-2026',
  ADMIN_PASSWORD:adminPassword,PAYMENT_PROVIDER:'wayforpay',
  WAYFORPAY_MERCHANT_ACCOUNT:'legwork_test_merchant',WAYFORPAY_SECRET_KEY:'test-merchant-secret-for-local-only-no-transactions',
  WAYFORPAY_UAH_PER_USD:'40.00'
 };
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',chunk=>stderr+=chunk.toString());
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break}catch{}await new Promise(done=>setTimeout(done,80))}
  assert.ok(ready,'Server did not start: '+stderr);
  const guestPaths=['/api/learning/2','/api/lessons/2/watch','/api/dashboard','/api/account/data-export',
   '/api/admin/overview','/api/admin/media','/api/admin/security-audit','/api/admin/certificates',
   '/api/admin/homework','/api/admin/bundles','/api/admin/deletion-requests','/api/payments/mine'];
  for(const url of guestPaths)assert.equal((await request(base,url)).status,401,url+' should require login');
  const alice=await request(base,'/api/auth/register',{method:'POST',data:{name:'Alice Matrix',email:'alice-matrix@example.org',password:'AliceMatrixPassword-2026'}});
  const bob=await request(base,'/api/auth/register',{method:'POST',data:{name:'Bob Matrix',email:'bob-matrix@example.org',password:'BobMatrixPassword-2026'}});
  assert.equal(alice.status,200);assert.equal(bob.status,200);
  assert.match(alice.headers.get('set-cookie')||'',/Max-Age=604800/);
  const studentPaths=['/api/admin/overview','/api/admin/media','/api/admin/security-audit','/api/admin/certificates','/api/admin/homework','/api/admin/bundles','/api/admin/deletion-requests','/api/admin/payments'];
  for(const url of studentPaths)assert.equal((await request(base,url,{cookie:alice.cookie})).status,403,url+' should reject non-admin');
  assert.equal((await request(base,'/api/admin/enroll',{cookie:alice.cookie,method:'POST',data:{user_id:alice.body.user.id,course_id:1}})).status,403);
  assert.equal((await request(base,'/api/admin/lessons/2/full',{cookie:alice.cookie,method:'PATCH',data:{video_url:'https://youtu.be/dQw4w9WgXcQ'}})).status,403);
  assert.equal((await request(base,'/api/learning/2',{cookie:alice.cookie})).status,403);
  assert.equal((await request(base,'/api/lessons/2/watch',{cookie:alice.cookie})).status,403);
  assert.equal((await request(base,'/api/progress/2',{cookie:alice.cookie,method:'POST',data:{completed:true}})).status,403);
  assert.equal((await request(base,'/api/account/activity',{cookie:alice.cookie,method:'POST',data:{lesson_id:2}})).status,403);
  assert.equal((await request(base,'/api/orders',{cookie:alice.cookie,method:'POST',data:{kind:'lesson',item_id:1}})).status,409,'Free lesson cannot be charged');
  assert.equal((await request(base,'/api/orders',{cookie:alice.cookie,method:'POST',data:{kind:'lesson',item_id:999999}})).status,404);
  const orderLesson=await request(base,'/api/orders',{cookie:alice.cookie,method:'POST',data:{kind:'lesson',item_id:2}});
  const orderCourse=await request(base,'/api/orders',{cookie:alice.cookie,method:'POST',data:{kind:'course',item_id:1}});
  assert.equal(orderLesson.status,201);assert.equal(orderCourse.status,201);
  assert.equal((await request(base,'/api/learning/2',{cookie:alice.cookie})).status,403,'Pending requests do not grant access');
  assert.equal((await request(base,'/api/orders/'+orderCourse.body.id+'/cancel',{cookie:bob.cookie,method:'POST',data:{}})).status,404);
  assert.equal((await request(base,'/api/payments/checkout',{cookie:bob.cookie,method:'POST',data:{order_ids:[orderCourse.body.id]}})).status,409,'Only order owner can initiate payment');
  assert.equal((await request(base,'/api/orders',{cookie:alice.cookie,method:'POST',origin:'https://attacker.example',data:{kind:'course',item_id:1}})).status,403,'Cross-site writes must be rejected');
  const admin=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:adminPassword}});
  assert.equal(admin.status,200);
  assert.match(admin.headers.get('set-cookie')||'',/Max-Age=43200/,'Admin sessions expire in 12 hours');
  const approved=await request(base,'/api/admin/orders/'+orderCourse.body.id+'/approve',{cookie:admin.cookie,method:'POST',data:{}});
  assert.equal(approved.status,200);
  assert.equal((await request(base,'/api/learning/2',{cookie:alice.cookie})).status,200);
  assert.equal((await request(base,'/api/lessons/2/watch',{cookie:alice.cookie})).status,200);
  assert.equal((await request(base,'/api/learning/2',{cookie:bob.cookie})).status,403);
  assert.equal((await request(base,'/api/lessons/2/watch',{cookie:bob.cookie})).status,403);
  assert.equal((await request(base,'/api/orders',{cookie:alice.cookie,method:'POST',data:{kind:'lesson',item_id:2}})).status,409,'Already-owned lesson cannot be sold twice');
  assert.equal((await request(base,'/api/orders/batch',{cookie:alice.cookie,method:'POST',data:{lesson_ids:[2],bundle_ids:[]}})).status,409);
  assert.equal((await request(base,'/api/payments/checkout',{cookie:alice.cookie,method:'POST',data:{order_ids:[orderLesson.body.id]}})).status,409,'Stale lesson order must not generate a charge');
  assert.equal((await request(base,'/api/admin/orders/'+orderLesson.body.id+'/approve',{cookie:admin.cookie,method:'POST',data:{}})).status,409,'Staff cannot manually approve an order for a lesson already owned via a course');
  const bobOrder=await request(base,'/api/orders',{cookie:bob.cookie,method:'POST',data:{kind:'course',item_id:1}});
  assert.equal(bobOrder.status,201);
  const bobCheckout=await request(base,'/api/payments/checkout',{cookie:bob.cookie,method:'POST',data:{order_ids:[bobOrder.body.id]}});
  assert.equal(bobCheckout.status,201,'Valid unowned course should still be payable');
  const bobAttempt=bobCheckout.body.attempt_id;
  assert.ok(bobAttempt>0);
  assert.equal((await request(base,'/api/payments/status/'+bobAttempt,{cookie:alice.cookie})).status,403);
  assert.equal((await request(base,'/api/payments/status/'+bobAttempt,{cookie:bob.cookie})).status,200);
  const aliceExport=await request(base,'/api/account/data-export',{cookie:alice.cookie});
  assert.equal(aliceExport.status,200);assert.equal(aliceExport.body.profile.email,'alice-matrix@example.org');
  assert.ok(!JSON.stringify(aliceExport.body).includes('bob-matrix@example.org'));
  const bobExport=await request(base,'/api/account/data-export',{cookie:bob.cookie});
  assert.equal(bobExport.body.profile.email,'bob-matrix@example.org');
  assert.ok(!JSON.stringify(bobExport.body).includes('alice-matrix@example.org'));
  assert.equal((await request(base,'/api/admin/security-audit',{cookie:alice.cookie})).status,403);
 }finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>setTimeout(resolve,150));
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:60000});
