import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import {registerAdminMfa,totp,base32} from '../lib/admin-mfa.js';
import {hashPassword,verifyPassword} from '../lib/security.js';
test('RFC 6238 known TOTP and Base32 vector',()=>{
 assert.equal(base32(Buffer.from('12345678901234567890')),'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
 assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',59000),'287082');
});
test('MFA setup, one-time recovery and login enforcement',async()=>{
 const db=new Database(':memory:');
 db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT,password_hash TEXT);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER)");
 db.prepare("INSERT INTO users VALUES(1,'admin',?)").run(hashPassword('secure-admin-pass-2026'));
 const old=process.env.SESSION_SECRET;process.env.SESSION_SECRET='mfa-temporary-test-secret-longer-than-32-chars';
 const app=express();app.use(express.json());
 const auth=(req,res,next)=>{if(!req.get('x-person'))return res.status(401).json({error:'Login'});req.user={id:req.get('x-person')==='admin'?1:2,role:req.get('x-person')};next()};
 const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Forbidden'});
 const svc=registerAdminMfa(app,db,{auth,admin,verifyPassword,tokenHash:()=>''});
 const server=app.listen(0,'127.0.0.1');await new Promise(ok=>server.once('listening',ok));
 try{
  const root='http://127.0.0.1:'+server.address().port;
  const request=async(p,{user='admin',method='GET',data}={})=>{const response=await fetch(root+p,{method,
   headers:{...(user?{'x-person':user}:{}),...(data?{'content-type':'application/json'}:{})},
   body:data?JSON.stringify(data):undefined});return {status:response.status,body:await response.json()}};
  assert.equal((await request('/api/admin/mfa/status',{user:''})).status,401);
  assert.equal((await request('/api/admin/mfa/status',{user:'student'})).status,403);
  assert.equal((await request('/api/admin/mfa/setup',{method:'POST',data:{password:'wrong'}})).status,403);
  const start=await request('/api/admin/mfa/setup',{method:'POST',data:{password:'secure-admin-pass-2026'}});
  assert.equal(start.status,200);
  assert.match(start.body.otpauth_uri,/^otpauth:\/\/totp/);
  const code=totp(start.body.secret);
  const enabled=await request('/api/admin/mfa/enable',{method:'POST',data:{password:'secure-admin-pass-2026',otp:code}});
  assert.equal(enabled.status,200);
  assert.equal(enabled.body.recovery_codes.length,8);
  assert.equal(svc.verifyLogin({id:1},''),false);
  assert.equal(svc.verifyLogin({id:1},code),false,'Setup TOTP must not be replayed');
  assert.equal(svc.verifyLogin({id:1},enabled.body.recovery_codes[0]),true);
  assert.equal(svc.verifyLogin({id:1},enabled.body.recovery_codes[0]),false);
  const disabled=await request('/api/admin/mfa/disable',{method:'POST',data:{password:'secure-admin-pass-2026',otp:enabled.body.recovery_codes[1]}});
  assert.equal(disabled.status,200);
  assert.equal((await request('/api/admin/mfa/status')).body.enabled,false);
 }finally{await new Promise(ok=>server.close(ok));db.close();if(old===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=old}
});
