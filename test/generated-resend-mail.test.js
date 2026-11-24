import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import {createMailService} from '../cloudflare/generated/mailing.js';
import {registerResendWebhooks} from '../lib/resend-webhook.js';

test('Cloudflare generated mail sends stable idempotency key and persists Resend receipt',async()=>{
 const db=new Database(':memory:');
 db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,role TEXT,password_hash TEXT)");
 const app=express(),pending=[],sent=[];
 const ctx={waitUntil(promise){pending.push(Promise.resolve(promise))},storage:{setAlarm:async()=>{}}};
 const env={RESEND_API_KEY:'re_test_secret',MAIL_FROM:'LEGWORK <hello@example.org>'};
 const previous={SITE_ORIGIN:process.env.SITE_ORIGIN,SESSION_SECRET:process.env.SESSION_SECRET};
 const originalFetch=globalThis.fetch;
 process.env.SITE_ORIGIN='https://legwork.example';
 process.env.SESSION_SECRET='32-character-test-secret-for-outbox-integrity';
 globalThis.fetch=async(url,init)=>{
  assert.equal(url,'https://api.resend.com/emails');
  sent.push(init);
  return {ok:true,status:200,json:async()=>({id:'em_test_123'})};
 };
 try{
  const mail=createMailService(app,db,{auth:()=>{},hashPassword:()=>'',cleanText:x=>x,env,ctx});
  registerResendWebhooks(app,db,{secret:''});
  assert.equal(mail.enabled,true);
  assert.equal(mail.notify('student@example.org','teacher:feedback:1','Legwork · Feedback ready','See feedback in your account'),true);
  await Promise.all(pending);
  const record=db.prepare('SELECT status,provider_id,delivery_status,attempts,payload FROM mail_outbox').get();
  assert.equal(record.status,'sent');
  assert.equal(record.provider_id,'em_test_123');
  assert.equal(record.delivery_status,'accepted');
  assert.equal(record.payload,'','Do not retain sensitive message content after provider accepted send');
  assert.equal(record.attempts,1);
  assert.equal(sent.length,1);
  assert.match(sent[0].headers['Idempotency-Key'],/^legwork-[a-f0-9]{64}$/);
  assert.equal(sent[0].headers.Authorization,'Bearer re_test_secret');
  assert.equal(JSON.parse(sent[0].body).text,'See feedback in your account');
  assert.equal(mail.notify('student@example.org','teacher:feedback:1','Legwork · Feedback ready','See feedback in your account'),true);
  await Promise.all(pending);
  assert.equal(sent.length,1,'Unique event keys must not re-send accepted email');
 }finally{
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value}
  db.close();
 }
});
