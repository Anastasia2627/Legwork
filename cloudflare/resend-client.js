/**
 * Resend HTTPS transport for Cloudflare. The delivery key is stable per outbox
 * event. Responses and API keys are never copied into logs or browser output.
 */
export async function sendResendEmail({apiKey,from,to,subject,text,idempotencyKey,fetchImpl=fetch}){
 if(typeof apiKey!=='string'||!apiKey.trim()||typeof from!=='string'||!from.trim()||
    typeof to!=='string'||!to.includes('@')||typeof subject!=='string'||!subject.trim()||
    typeof text!=='string'||!text.trim()||typeof idempotencyKey!=='string'||
    !/^[a-zA-Z0-9_-]{1,256}$/.test(idempotencyKey)){
  throw Error('Invalid email configuration or message');
 }
 const response=await fetchImpl('https://api.resend.com/emails',{
  method:'POST',
  headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
  body:JSON.stringify({from,to:[to],subject,text})
 });
 if(!response.ok)throw Error('Email provider rejected request (HTTP '+response.status+')');
 const receipt=await response.json().catch(()=>null);
 if(typeof receipt?.id!=='string'||!receipt.id)throw Error('Email provider returned no delivery receipt');
 return {id:receipt.id};
}
