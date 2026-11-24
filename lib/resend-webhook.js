import crypto from 'node:crypto';

/**
 * Resend signs the exact raw JSON bytes with Svix HMAC-SHA256.
 * Never trust email.to/email_id from an unsigned payload.
 */
const EVENTS=Object.freeze({
 'email.sent':['accepted',1],
 'email.delivery_delayed':['delayed',2],
 'email.delivered':['delivered',3],
 'email.failed':['failed',4],
 'email.suppressed':['suppressed',5],
 'email.bounced':['bounced',6],
 'email.complained':['complained',7],
});
const MAX_SKEW_SECONDS=300;
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
const safeString=value=>typeof value==='string'&&value.length>0&&value.length<128;
const emailPattern=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const noStore=res=>res.setHeader('Cache-Control','private, no-store');

export function verifyResendSignature(body,headers,secret,current=Date.now()){
 if(!Buffer.isBuffer(body)||body.length>65536||!/^whsec_[A-Za-z0-9+/=_-]{32,}$/.test(String(secret||'')))return false;
 const id=headers['svix-id'],rawTime=headers['svix-timestamp'],signature=headers['svix-signature'];
 if(!validId(id)||typeof rawTime!=='string'||!/^\d{10}$/.test(rawTime)||
   !safeString(signature)||Math.abs(Math.floor(current/1000)-Number(rawTime))>MAX_SKEW_SECONDS)return false;
 let key;
 try{key=Buffer.from(secret.slice(6).replaceAll('-','+').replaceAll('_','/'),'base64')}
 catch{return false}
 if(key.length<24)return false;
 const expected=crypto.createHmac('sha256',key).update(id+'.'+rawTime+'.').update(body).digest();
 return signature.split(' ').some(entry=>{
  if(!entry.startsWith('v1,'))return false;
  try{
   const actual=Buffer.from(entry.slice(3),'base64');
   return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
  }catch{return false}
 });
}

export function initResendDeliveryTracking(db){
 db.exec([
  'CREATE TABLE IF NOT EXISTS resend_delivery_events(svix_id TEXT PRIMARY KEY,provider_id TEXT NOT NULL,event_type TEXT NOT NULL,received_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS resend_events_provider_idx ON resend_delivery_events(provider_id)',
  'CREATE TABLE IF NOT EXISTS email_suppressions(email TEXT PRIMARY KEY,reason TEXT NOT NULL,recorded_at INTEGER NOT NULL)'
 ].join(';')+';');
 const columns=new Set(db.pragma('table_info(mail_outbox)').map(col=>col.name));
 if(!columns.has('provider_id'))db.exec('ALTER TABLE mail_outbox ADD COLUMN provider_id TEXT');
 if(!columns.has('delivery_status'))db.exec("ALTER TABLE mail_outbox ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'unconfirmed'");
 if(!columns.has('delivered_at'))db.exec('ALTER TABLE mail_outbox ADD COLUMN delivered_at INTEGER');
 db.exec('CREATE INDEX IF NOT EXISTS mail_outbox_provider_idx ON mail_outbox(provider_id)');
}

// Apply out-of-order events deterministically. An older "sent" event must
// never erase a verified delivery, bounce or spam complaint.
export function reconcileResendMessage(db,providerId){
 if(!validId(providerId))return null;
 const message=db.prepare('SELECT id,recipient,delivery_status FROM mail_outbox WHERE provider_id=?').get(providerId);
 if(!message)return null;
 const events=db.prepare('SELECT event_type FROM resend_delivery_events WHERE provider_id=?').all(providerId);
 let winning=['accepted',1];
 for(const row of events){
  const entry=EVENTS[row.event_type];
  if(entry&&entry[1]>winning[1])winning=entry;
 }
 const now=Math.floor(Date.now()/1000);
 db.prepare('UPDATE mail_outbox SET delivery_status=?,delivered_at=CASE WHEN ?=? THEN COALESCE(delivered_at,?) ELSE delivered_at END WHERE id=?')
  .run(winning[0],winning[0],'delivered',now,message.id);
 if(['bounced','complained','suppressed'].includes(winning[0])){
  const email=message.recipient.trim().toLowerCase();
  if(emailPattern.test(email)){
   db.prepare('INSERT INTO email_suppressions(email,reason,recorded_at) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET reason=excluded.reason,recorded_at=excluded.recorded_at')
    .run(email,winning[0],now);
   if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='marketing_signups'").get())
    db.prepare('UPDATE marketing_signups SET unsubscribed_at=CURRENT_TIMESTAMP WHERE email=? AND unsubscribed_at IS NULL').run(email);
  }
 }
 return winning[0];
}

export function registerResendWebhooks(app,db,{secret=process.env.RESEND_WEBHOOK_SECRET}={}){
 initResendDeliveryTracking(db);
 app.post('/api/email/resend/webhook',(req,res)=>{
  noStore(res);
  if(!secret)return res.status(503).json({error:'Resend webhook signing not configured'});
  if(!verifyResendSignature(req.body,req.headers,secret))return res.status(401).json({error:'Invalid webhook signature'});
  let event;
  try{event=JSON.parse(req.body.toString('utf8'))}
  catch{return res.status(400).json({error:'Invalid JSON payload'})}
  const type=event?.type,providerId=event?.data?.email_id,id=req.get('svix-id');
  if(!EVENTS[type])return res.json({ok:true,ignored:true});
  if(!validId(providerId))return res.status(400).json({error:'Invalid provider message identifier'});
  try{
   const inserted=db.prepare('INSERT OR IGNORE INTO resend_delivery_events(svix_id,provider_id,event_type,received_at) VALUES(?,?,?,?)')
    .run(id,providerId,type,Date.now()).changes;
   if(inserted)reconcileResendMessage(db,providerId);
   return res.json({ok:true,duplicate:!inserted});
  }catch{
   return res.status(503).json({error:'Delivery event could not be stored'});
  }
 });
}
