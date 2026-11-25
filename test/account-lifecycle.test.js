import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {hashPassword} from '../lib/security.js';

async function port(){
 return new Promise((resolve,reject)=>{
  const socket=net.createServer();
  socket.once('error',reject);
  socket.listen(0,'127.0.0.1',()=>{const value=socket.address().port;socket.close(()=>resolve(value))});
 });
}
test('Account lifecycle keeps recovery links, sessions and profile data consistent',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-lifecycle-'));
 const number=await port(),base='http://127.0.0.1:'+number;
 const adminPassword='test-only-course-order-password-2026';
 const origin=base,dbPath=path.join(dir,'security.sqlite'),outbox=path.join(dir,'mail.jsonl'),secret='test-only-session-secret-0123456789';
 const child=spawn(process.execPath,['server.js'],{
  cwd:process.cwd(),
  env:{...process.env,NODE_ENV:'test',PORT:String(number),DATABASE_PATH:dbPath,
   ADMIN_PASSWORD:adminPassword,SESSION_SECRET:secret,SITE_ORIGIN:origin,
   SMTP_HOST:'',SMTP_FROM:'',SMTP_PORT:'',MAIL_TEST_OUTBOX_PATH:outbox,RESEND_WEBHOOK_SECRET:'',PAYMENT_PROVIDER:'disabled',REGISTRATION_OPEN:'false'},
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


  const email='lifecycle@example.org',password='OriginalPassword-2026',next='UpdatedPassword-2026',final='RecoveredPassword-2026';
  const send=(route,data,cookie)=>request(route,{method:'POST',data,cookie});
  const register={name:'Student',email,password};
  for(const invalid of [{email:'a b@example.org'},{email:'a@@example.org'},{name:{}},{name:'x'.repeat(81)}]){
   assert.equal((await send('/api/auth/register',{...register,...invalid})).status,400);
  }
  const account=await send('/api/auth/register',{...register,email:' LIFECYCLE@example.org '});
  assert.equal(account.status,200);const first=account.cookie;
  assert.equal((await send('/api/auth/register',register)).status,409);
  const getMailToken=async(purpose)=>{
   for(let i=0;i<100;i++){
    const lines=await readFile(outbox,'utf8').catch(()=>'');
    const tokens=[...lines.matchAll(new RegExp(purpose+'/([a-f0-9]{64})','g'))];
    if(tokens.length)return tokens.at(-1)[1];
    await new Promise(resolve=>setTimeout(resolve,50));
   }
   throw Error('Test mail not delivered');
  };
  const verify=await getMailToken('verify-email');
  assert.equal((await send('/api/auth/verify-email',{token:verify})).status,200);
  assert.equal((await send('/api/auth/verify-email',{token:verify})).status,400);
  assert.equal((await request('/api/account/email-status',{cookie:first})).body.verified,true);
  const second=(await send('/api/auth/login',{email,password})).cookie;
  assert.equal((await request('/api/account/sessions',{cookie:first})).body.active_sessions,2);
  assert.equal((await send('/api/account/sessions/revoke-others',{password},first)).body.revoked_sessions,1);
  assert.equal((await request('/api/me',{cookie:second})).body.user,null);
  assert.equal((await request('/api/profile',{method:'PATCH',cookie:first,data:{name:{}}})).status,400);
  assert.equal((await request('/api/profile',{method:'PATCH',cookie:first,data:{name:' Updated ',instagram:' dance '}})).body.profile.instagram,'dance');
  assert.equal((await request('/api/profile',{method:'PATCH',cookie:first,data:{name:'Updated again'}})).body.profile.instagram,'dance');
  await send('/api/auth/forgot-password',{email});
  const oldToken=await getMailToken('reset-password');
  assert.equal((await send('/api/account/change-password',{current_password:password,new_password:next},first)).status,200);
  assert.equal((await request('/api/me',{cookie:first})).body.user,null);
  assert.equal((await send('/api/auth/reset-password',{token:oldToken,password:final})).status,400);
  const third=(await send('/api/auth/login',{email,password:next})).cookie;
  assert.ok(third);
  // Insert a fresh valid token directly: avoid waiting for the resend cooldown.
  const token=crypto.randomBytes(32).toString('hex'),time=Math.floor(Date.now()/1000);
  const db=new Database(dbPath);
  try{
   const uid=db.prepare('SELECT id FROM users WHERE email=?').get(email).id;
   const digest=crypto.createHmac('sha256',secret).update('reset:'+token).digest('hex');
   db.prepare("INSERT INTO email_tokens(user_id,purpose,token_hash,created_at,expires_at) VALUES(?,'reset',?,?,?)").run(uid,digest,time,time+1800);
  }finally{db.close();}
  assert.equal((await send('/api/auth/reset-password',{token,password:final})).status,200);
  assert.equal((await send('/api/auth/reset-password',{token,password:final})).status,400);
  assert.equal((await request('/api/me',{cookie:third})).body.user,null);
  const fourth=(await send('/api/auth/login',{email,password:final})).cookie;
  assert.ok(fourth);
  assert.equal((await send('/api/account/deletion-request',{password:'wrong'},fourth)).status,403);
  assert.equal((await send('/api/account/deletion-request',{password:final},fourth)).status,201);
  assert.equal((await send('/api/account/deletion-request',{password:final},fourth)).status,200);
  assert.equal((await request('/api/account/deletion-request',{cookie:fourth})).body.request.status,'pending');
  assert.equal((await request('/api/me',{cookie:fourth})).body.user.email,email);
 }finally{
  child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:45000});
