import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import Database from 'better-sqlite3';
import {verifyResendSignature,registerResendWebhooks,reconcileResendMessage} from '../lib/resend-webhook.js';

const key=Buffer.from('Resend-unit-test-secret-32bytes-larger','utf8');
const secret='whsec_'+key.toString('base64');
const sign=(payload,id='msg_abc123456',time=String(Math.floor(Date.now()/1000)))=>{
 const body=Buffer.from(JSON.stringify(payload));
 const sig=crypto.createHmac('sha256',key).update(id+'.'+time+'.').update(body).digest('base64');
 return {body,headers:{'svix-id':id,'svix-timestamp':time,'svix-signature':'v1,'+sig}};
};
test('Resend Svix validates raw bytes, signature, freshness and key',()=>{
 const data=sign({type:'email.delivered',data:{email_id:'abc-123'}});
 assert.equal(verifyResendSignature(data.body,data.headers,secret),true);
 assert.equal(verifyResendSignature(Buffer.from(data.body.toString().replace('delivered','bounced')),data.headers,secret),false);
 assert.equal(verifyResendSignature(data.body,{...data.headers,'svix-signature':'v1,not-a-sig'},secret),false);
 assert.equal(verifyResendSignature(data.body,data.headers,'whsec_wrong'),false);
 const old=sign({type:'email.delivered',data:{email_id:'abc'}},'msg_expired',String(Math.floor(Date.now()/1000)-400));
 assert.equal(verifyResendSignature(old.body,old.headers,secret),false);
});
test('Webhook rejects forgery and replays, reconciles out of order, suppresses bounces',async()=>{
 const db=new Database(':memory:');
 db.exec("CREATE TABLE mail_outbox(id INTEGER PRIMARY KEY,recipient TEXT,provider_id TEXT,delivery_status TEXT,delivered_at INTEGER);"+
 "CREATE TABLE marketing_signups(email TEXT,purpose TEXT,unsubscribed_at TEXT);"+
 "INSERT INTO mail_outbox(id,recipient,provider_id,delivery_status) VALUES(1,'student@example.org','delivery-1','accepted');"+
 "INSERT INTO marketing_signups VALUES('student@example.org','newsletter',NULL);");
 const app=express();
 app.use('/api/email/resend/webhook',express.raw({type:'application/json',limit:'64kb'}));
 app.use(express.json());
 registerResendWebhooks(app,db,{secret});
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/api/email/resend/webhook';
  const post=async(type,id='msg_'+type.replaceAll('.','_'))=>{
   const {body,headers}=sign({type,data:{email_id:'delivery-1',to:['student@example.org']}},id);
   const response=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body});
   return {status:response.status,data:await response.json()};
  };
  const forgery=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'email.delivered'})});
  assert.equal(forgery.status,401);
  assert.equal((await post('email.delivered')).status,200);
  assert.equal(db.prepare('SELECT delivery_status FROM mail_outbox WHERE id=1').get().delivery_status,'delivered');
  const bounce=await post('email.bounced');
  assert.equal(bounce.status,200);
  assert.equal((await post('email.bounced')).data.duplicate,true);
  assert.equal(db.prepare('SELECT delivery_status FROM mail_outbox WHERE id=1').get().delivery_status,'bounced');
  assert.equal((await post('email.sent')).status,200);
  assert.equal(db.prepare('SELECT delivery_status FROM mail_outbox WHERE id=1').get().delivery_status,'bounced');
  assert.equal(db.prepare('SELECT reason FROM email_suppressions WHERE email=?').get('student@example.org').reason,'bounced');
  assert.ok(db.prepare("SELECT unsubscribed_at FROM marketing_signups").get().unsubscribed_at);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM resend_delivery_events').get().n,3);
  // Event arriving before the provider-id is stored is reconciled later.
  const delayed=sign({type:'email.delivered',data:{email_id:'late-message'}},'msg_late');
  const response=await fetch(url,{method:'POST',headers:{...delayed.headers,'Content-Type':'application/json'},body:delayed.body});
  assert.equal(response.status,200);
  db.prepare("INSERT INTO mail_outbox(id,recipient,provider_id,delivery_status) VALUES(2,'other@example.org','late-message','accepted')").run();
  assert.equal(reconcileResendMessage(db,'late-message'),'delivered');
  assert.equal(db.prepare('SELECT delivery_status FROM mail_outbox WHERE id=2').get().delivery_status,'delivered');
 }finally{await new Promise(resolve=>server.close(resolve));db.close()}
});
