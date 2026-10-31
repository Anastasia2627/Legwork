import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';

function port(){return new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p))})})}
async function request(base,uri,{method='GET',cookie,data}={}){
 const response=await fetch(base+uri,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 let json;try{json=await response.json()}catch{json={}};
 return {status:response.status,data:json,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function findMail(file,needle){
 for(let i=0;i<75;i++){
  try{const rows=(await readFile(file,'utf8')).split('\n').filter(Boolean).map(x=>JSON.parse(x));
   const entry=rows.find(m=>m.subject.includes(needle));if(entry)return entry;
  }catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error('Expected mail not delivered in test mode: '+needle);
}
test('verification, password reset, resend limits and account notification flows',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-mail-')),mailFile=path.join(dir,'messages.jsonl'),dbFile=path.join(dir,'school.sqlite');
 const p=await port(),base='http://127.0.0.1:'+p;
 const adminPassword='Test-Only-Admin-Password-02468';
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(p),NODE_ENV:'test',SITE_ORIGIN:base,SESSION_SECRET:'legwork-test-email-secret-very-strong-and-unique-987654',ADMIN_PASSWORD:adminPassword,DATABASE_PATH:dbFile,MAIL_TEST_OUTBOX_PATH:mailFile,PAYMENT_PROVIDER:'disabled'},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d);
 try{
  let started=false;for(let i=0;i<70;i++){try{started=(await fetch(base+'/health')).ok;if(started)break}catch{}await new Promise(r=>setTimeout(r,100))}
  assert.equal(started,true,'App did not start '+stderr);
  const conf=await request(base,'/api/email/config');assert.equal(conf.data.enabled,true);
  const reg=await request(base,'/api/auth/register',{method:'POST',data:{name:'Mail Student',email:'mail-student@example.org',password:'PasswordBeforeReset!90210'}});
  assert.equal(reg.status,200);const cookie=reg.cookie;
  const before=await request(base,'/api/account/email-status',{cookie});assert.equal(before.data.verified,false);
  assert.equal((await request(base,'/api/orders',{cookie,method:'POST',data:{kind:'course',item_id:1}})).status,403);
  assert.equal((await request(base,'/api/auth/resend-verification',{cookie,method:'POST',data:{}})).status,429,'Verification emails are throttled');
  const verification=await findMail(mailFile,'Verify your email');
  assert.equal(verification.to,'mail-student@example.org');
  const token=verification.text.match(/#\/verify-email\/([a-f0-9]{64})/)?.[1];assert.ok(token,'Link must have an opaque token');
  assert.equal((await request(base,'/api/auth/verify-email',{method:'POST',data:{token}})).status,200);
  assert.equal((await request(base,'/api/auth/verify-email',{method:'POST',data:{token}})).status,400,'Verification token cannot be used twice');
  assert.equal((await request(base,'/api/account/email-status',{cookie})).data.verified,true);
  const purchase=await request(base,'/api/orders',{cookie,method:'POST',data:{kind:'course',item_id:1}});
  assert.equal(purchase.status,201,'Verified students can request orders');
  const unknown=await request(base,'/api/auth/forgot-password',{method:'POST',data:{email:'nobody@example.org'}});
  const known=await request(base,'/api/auth/forgot-password',{method:'POST',data:{email:'mail-student@example.org'}});
  assert.equal(unknown.status,200);assert.equal(known.status,200);assert.equal(unknown.data.message,known.data.message,'Account recovery must not reveal registered emails');
  const reset=await findMail(mailFile,'Reset your password'),resetToken=reset.text.match(/#\/reset-password\/([a-f0-9]{64})/)?.[1];assert.ok(resetToken);
  assert.equal((await request(base,'/api/auth/reset-password',{method:'POST',data:{token:resetToken,password:'short'}})).status,400);
  const changed=await request(base,'/api/auth/reset-password',{method:'POST',data:{token:resetToken,password:'PasswordAfterReset#667788'}});
  assert.equal(changed.status,200);
  assert.equal((await request(base,'/api/auth/reset-password',{method:'POST',data:{token:resetToken,password:'PasswordAfterReset#667788'}})).status,400,'Recovery token must be one-time');
  assert.equal((await request(base,'/api/dashboard',{cookie})).status,401,'Password reset invalidates all earlier sessions');
  assert.equal((await request(base,'/api/auth/login',{method:'POST',data:{email:'mail-student@example.org',password:'PasswordBeforeReset!90210'}})).status,401);
  const again=await request(base,'/api/auth/login',{method:'POST',data:{email:'mail-student@example.org',password:'PasswordAfterReset#667788'}});
  assert.equal(again.status,200);
  const staff=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:adminPassword}});assert.equal(staff.status,200);
  assert.equal((await request(base,'/api/admin/email-outbox',{cookie:again.cookie})).status,403);
  const granted=await request(base,'/api/admin/orders/'+purchase.data.id+'/approve',{cookie:staff.cookie,method:'POST',data:{}});
  assert.equal(granted.status,200);
  const receipt=await findMail(mailFile,'Your course access is ready');assert.equal(receipt.to,'mail-student@example.org');
  assert.ok(!receipt.text.includes('PasswordAfterReset'),'Receipt should not include password');
  const stats=await request(base,'/api/admin/email-outbox',{cookie:staff.cookie});
  assert.equal(stats.status,200);
  assert.ok(stats.data.stats.some(s=>s.status==='sent'));
 }finally{child.kill('SIGTERM');await rm(dir,{recursive:true,force:true})}
},{timeout:30000});
