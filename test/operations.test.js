import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import {registerOperationsRoutes} from '../lib/operations.js';
test('Operational status is admin-only and exposes aggregate counts, no secrets',async()=>{
 const db=new Database(':memory:');
 db.exec("CREATE TABLE mail_outbox(status TEXT);INSERT INTO mail_outbox VALUES('failed'),('pending'),('sent');"+
 "CREATE TABLE payment_attempts(status TEXT,created_at TEXT);INSERT INTO payment_attempts VALUES('review_required','2026-01-01 00:00:00');"+
 "CREATE TABLE uploaded_images(bytes INTEGER);INSERT INTO uploaded_images VALUES(2048), (4096);"+
 "CREATE TABLE account_deletion_requests(status TEXT);INSERT INTO account_deletion_requests VALUES('pending');");
 const app=express();
 const auth=(req,res,next)=>req.get('x-test-user')?next():res.status(401).json({error:'Log in'});
 const admin=(req,res,next)=>req.get('x-test-user')==='admin'?next():res.status(403).json({error:'Forbidden'});
 registerOperationsRoutes(app,db,{auth,admin,mail:{enabled:true}});
 const server=app.listen(0,'127.0.0.1');
 await new Promise(ok=>server.once('listening',ok));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/api/admin/operations/status';
  assert.equal((await fetch(url)).status,401);
  assert.equal((await fetch(url,{headers:{'x-test-user':'student'}})).status,403);
  const resp=await fetch(url,{headers:{'x-test-user':'admin'}});
  assert.equal(resp.status,200);
  assert.equal(resp.headers.get('cache-control'),'private, no-store');
  const body=await resp.json();
  assert.equal(body.checks.mail_pending,1);
  assert.equal(body.checks.mail_failed,1);
  assert.equal(body.checks.payments_require_review,1);
  assert.equal(body.checks.stored_public_image_bytes,6144);
  assert.equal(body.checks.privacy_requests_open,1);
  assert.equal(body.checks.independent_backup_verified,false);
  assert.ok(body.alerts.some(a=>a.code==='payment_review'));
  assert.equal(JSON.stringify(body).includes('password'),false);
 }finally{await new Promise(ok=>server.close(ok));db.close()}
});
