import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import Database from 'better-sqlite3';
import {hashPassword} from '../lib/security.js';

async function port(){
 return new Promise((resolve,reject)=>{
  const socket=net.createServer();
  socket.once('error',reject);
  socket.listen(0,'127.0.0.1',()=>{const value=socket.address().port;socket.close(()=>resolve(value))});
 });
}
test('Production origin checks cover every browser write and email verification fails closed',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-origin-'));
 const number=await port(),base='http://127.0.0.1:'+number;
 const adminPassword='test-only-course-order-password-2026';
 const origin='https://school.example.org',dbPath=path.join(dir,'security.sqlite');
 const child=spawn(process.execPath,['server.js'],{
  cwd:process.cwd(),
  env:{...process.env,NODE_ENV:'production',PORT:String(number),DATABASE_PATH:dbPath,
   ADMIN_PASSWORD:adminPassword,SESSION_SECRET:'test-only-session-secret-0123456789',SITE_ORIGIN:origin,
   SMTP_HOST:'',SMTP_FROM:'',SMTP_PORT:'',MAIL_TEST_OUTBOX_PATH:'',RESEND_WEBHOOK_SECRET:'',PAYMENT_PROVIDER:'disabled',REGISTRATION_OPEN:'false'},
  stdio:['ignore','pipe','pipe']
 });
 let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
 const request=async(route,{method='GET',cookie,data,headers={},raw}={})=>{
  const r=await fetch(base+route,{method,headers:{
   ...(cookie?{Cookie:cookie}:{}),...(data||raw!==undefined?{'Content-Type':'application/json'}:{}),...headers
  },body:raw??(data?JSON.stringify(data):undefined)});
  let body;try{body=await r.json()}catch{body=null}
  return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0],cache:r.headers.get('cache-control'),setCookie:r.headers.get('set-cookie')};
 };
 try{
  let ready=false;
  for(let i=0;i<80;i++){
   try{if((await request('/health')).status===200){ready=true;break}}catch{}
   await new Promise(done=>setTimeout(done,100));
  }
  assert.ok(ready,stderr);

  const same={Origin:origin},cross={Origin:'https://unrelated.example.org'};
  const loginData={email:'Admin',password:adminPassword};
  assert.equal((await request('/api/auth/login',{method:'POST',data:loginData,headers:cross})).status,403);
  assert.equal((await request('/api/auth/login',{method:'POST',data:loginData})).status,403);
  const adminLogin=await request('/api/auth/login',{method:'POST',data:loginData,headers:same});
  assert.equal(adminLogin.status,200);const admin=adminLogin.cookie;
  assert.match(adminLogin.setCookie,/HttpOnly/);assert.match(adminLogin.setCookie,/Secure/);
  const db=new Database(dbPath);
  try{db.prepare('INSERT INTO users(email,name,password_hash) VALUES(?,?,?)').run('security-test@example.org','Student',hashPassword('UniqueStudentPassword-2026'));}finally{db.close();}
  const studentLogin=await request('/api/auth/login',{method:'POST',data:{email:'security-test@example.org',password:'UniqueStudentPassword-2026'},headers:same});
  assert.equal(studentLogin.status,200);const student=studentLogin.cookie;
  const denied=[
   ['/api/admin/mfa/setup',admin,{password:adminPassword}],
   ['/api/admin/mfa/enable',admin,{}],['/api/admin/mfa/disable',admin,{}],
   ['/api/admin/email-outbox/retry',admin,{}],
   ['/api/auth/resend-verification',student,{}],
   ['/api/auth/forgot-password',null,{email:'security-test@example.org'}],
   ['/api/auth/reset-password',null,{}],['/api/auth/verify-email',null,{}],
   ['/api/auth/logout',student,{}]
  ];
  for(const [route,cookie,data] of denied){
   for(const headers of [cross,{}, {...same,'Sec-Fetch-Site':'cross-site'}]){
    const result=await request(route,{method:'POST',cookie,data,headers});
    assert.equal(result.status,403,route);
    assert.match(result.body.error,/origin|referer/i);
   }
  }
  assert.equal((await request('/api/admin/mfa/setup',{method:'POST',cookie:admin,data:{password:adminPassword},headers:same})).status,200);
  assert.equal((await request('/api/me',{cookie:student})).body.user.email,'security-test@example.org');
  const config=await request('/api/email/config');
  assert.equal(config.body.enabled,false);
  assert.equal(config.body.verification_required,true);
  assert.equal(config.body.registration_open,false);
  assert.equal((await request('/api/account/email-status',{cookie:student})).body.verification_required,true);
  const course=(await request('/api/courses')).body.courses[0];
  const order=await request('/api/orders',{method:'POST',cookie:student,data:{kind:'course',item_id:course.id},headers:same});
  assert.equal(order.status,403);assert.equal(order.body.code,'EMAIL_UNVERIFIED');
  assert.match((await request('/api/me')).cache,/no-store/);
  assert.match((await request('/api/courses')).cache,/no-store/);
  const malformed=await request('/api/auth/login',{method:'POST',raw:'{"password":"private-body-test"',headers:same});
  assert.equal(malformed.status,400);assert.equal(malformed.body.error,'Invalid request body');
  assert.equal(stderr.includes('private-body-test'),false);
  const webhook=await request('/api/payments/wayforpay/webhook',{method:'POST',data:{},headers:cross});
  assert.equal(webhook.status,503); // independent provider authentication; disabled here
  const logout=await request('/api/auth/logout',{method:'POST',cookie:student,data:{},headers:same});
  assert.equal(logout.status,200);assert.match(logout.setCookie,/Max-Age=0/);
  assert.equal((await request('/api/me',{cookie:student})).body.user,null);
 }finally{
  child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:45000});
