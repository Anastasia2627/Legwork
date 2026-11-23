import test from 'node:test';
import assert from 'node:assert/strict';
import {sendResendEmail} from '../cloudflare/resend-client.js';

test('Resend HTTPS uses a stable idempotency key and excludes secrets from email body',async()=>{
 const calls=[];
 const result=await sendResendEmail({apiKey:'re_test_private',from:'LEGWORK <school@example.org>',
  to:'student@example.org',subject:'Verify your email',text:'https://example.org/#/verify-email/token',
  idempotencyKey:'legwork_stable_123',fetchImpl:async(url,options)=>{
   calls.push({url,options});
   return {ok:true,status:200,json:async()=>({id:'email-123'})};
  }});
 assert.equal(result.id,'email-123');
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.resend.com/emails');
 assert.equal(calls[0].options.headers['Idempotency-Key'],'legwork_stable_123');
 assert.equal(calls[0].options.headers.Authorization,'Bearer re_test_private');
 const data=JSON.parse(calls[0].options.body);
 assert.deepEqual(data.to,['student@example.org']);
 assert.equal(data.text,'https://example.org/#/verify-email/token');
 assert.equal(JSON.stringify(data).includes('re_test_private'),false);
});

test('Resend failures, invalid configuration and missing receipts stay unsent',async()=>{
 const args={apiKey:'re_test_private',from:'LEGWORK <school@example.org>',to:'student@example.org',
  subject:'Verify your email',text:'Hello there',idempotencyKey:'legwork_stable_123'};
 await assert.rejects(sendResendEmail({...args,fetchImpl:async()=>({ok:false,status:403})}),/HTTP 403/);
 await assert.rejects(sendResendEmail({...args,fetchImpl:async()=>({ok:true,json:async()=>({})})}),/receipt/);
 await assert.rejects(sendResendEmail({...args,idempotencyKey:'bad key',fetchImpl:async()=>{throw Error('Must not send')}}),/Invalid/);
});
