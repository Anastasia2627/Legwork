import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import {hashPassword,verifyPassword} from '../lib/security.js';
import {initResendDeliveryTracking,registerResendSuppressionAdminRoutes} from '../lib/resend-webhook.js';

test('Suppressed addresses are admin-only and password-confirmed release never restores marketing consent',async()=>{
 const db=new Database(':memory:');
 db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT,password_hash TEXT);CREATE TABLE mail_outbox(id INTEGER PRIMARY KEY)");
 db.prepare("INSERT INTO users VALUES(1,'admin',?)").run(hashPassword('correct-password-1001'));
 initResendDeliveryTracking(db);
 db.prepare('INSERT INTO email_suppressions(email,reason,recorded_at) VALUES(?,?,?)').run('bounced@example.org','bounced',Date.now());
 const app=express();app.use(express.json());
 const auth=(req,res,next)=>{if(!req.get('x-user'))return res.status(401).end();req.user={id:req.get('x-user')==='admin'?1:2,role:req.get('x-user')};next()};
 const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).end();
 registerResendSuppressionAdminRoutes(app,db,{auth,admin,verifyPassword});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  const req=async(path,{role='admin',method='GET',body}={})=>{
   const r=await fetch(url+path,{method,headers:{...(role?{'x-user':role}:{}),...(body?{'content-type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined});
   return {status:r.status,body:await r.json().catch(()=>null),headers:r.headers};
  };
  assert.equal((await req('/api/admin/email-suppressions',{role:''})).status,401);
  assert.equal((await req('/api/admin/email-suppressions',{role:'student'})).status,403);
  const listed=await req('/api/admin/email-suppressions');
  assert.equal(listed.body.suppressed.length,1);
  assert.equal(listed.headers.get('cache-control'),'private, no-store');
  const path='/api/admin/email-suppressions/release';
  assert.equal((await req(path,{method:'POST',body:{email:'bounced@example.org',password:'bad'}})).status,403);
  assert.equal((await req(path,{method:'POST',role:'student',body:{email:'bounced@example.org',password:'correct-password-1001'}})).status,403);
  const result=await req(path,{method:'POST',body:{email:'bounced@example.org',password:'correct-password-1001'}});
  assert.equal(result.status,200);
  assert.equal(result.body.ok,true);
  assert.equal((await req('/api/admin/email-suppressions')).body.suppressed.length,0);
 }finally{await new Promise(resolve=>server.close(resolve));db.close()}
});
