import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import Database from 'better-sqlite3';

const key=Buffer.from('integration-webhook-secret-longer-than-24-bytes');
const webhookSecret='whsec_'+key.toString('base64');
async function pickPort(){return new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
test('Real Node app authenticates Resend webhook without Origin and protects administrator mutations from CSRF',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-resend-server-'));
 const port=await pickPort(),origin='http://127.0.0.1:'+port;
 const dbFile=path.join(dir,'school.sqlite'),password='test-only-admin-strong-password-2026';
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,
  NODE_ENV:'test',PORT:String(port),SITE_ORIGIN:origin,DATABASE_PATH:dbFile,ADMIN_PASSWORD:password,
  SESSION_SECRET:'resend-real-integration-session-secret-2026',PAYMENT_PROVIDER:'disabled',
  RESEND_WEBHOOK_SECRET:webhookSecret},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',d=>errors+=d.toString());
 try{
  let up=false;for(let i=0;i<70;i++){
   try{if((await fetch(origin+'/health')).ok){up=true;break}}catch{}
   await new Promise(ok=>setTimeout(ok,100));
  }
  assert.ok(up,'Node server launch: '+errors);
  const path='/api/email/resend/webhook';
  const event={type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:'em-integration-email-1',to:['student@example.org']}};
  const body=Buffer.from(JSON.stringify(event));
  const svixId='msg_node_integration',timestamp=String(Math.floor(Date.now()/1000));
  const sig=crypto.createHmac('sha256',key).update(svixId+'.'+timestamp+'.').update(body).digest('base64');
  const headers={'Content-Type':'application/json','svix-id':svixId,'svix-timestamp':timestamp,'svix-signature':'v1,'+sig};
  const signed=await fetch(origin+path,{method:'POST',headers,body});
  assert.equal(signed.status,200,'Signed provider webhook must bypass browser-origin CSRF policy');
  assert.equal((await signed.json()).ok,true);
  const forged=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body});
  assert.equal(forged.status,401);
  const db=new Database(dbFile,{readonly:true});
  try{assert.equal(db.prepare('SELECT COUNT(*) n FROM resend_delivery_events').get().n,1)}
  finally{db.close()}
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({email:'admin',password})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const csrf=await fetch(origin+'/api/admin/email-suppressions/release',{method:'POST',
   headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'https://untrusted.example'},
   body:JSON.stringify({email:'student@example.org',password})});
  assert.equal(csrf.status,403,'Administrator state changes require same-origin requests');
 }finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()});
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:30000});
