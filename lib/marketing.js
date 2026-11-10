import crypto from 'node:crypto';

/**
 * Marketing preferences are per purpose, not one row per email.
 * An address may request a free lesson and separately opt into school news.
 * Subscriptions never create an account or automatically enroll a customer.
 */
export function registerMarketingRoutes(app,db,{auth,admin,mail}){
 const purposes=new Set(['newsletter','free-lesson','book']);
 const emailPattern=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
 const randomToken=()=>crypto.randomBytes(32).toString('hex');
 const digest=t=>crypto.createHash('sha256').update(t).digest('hex');
 db.exec("CREATE TABLE IF NOT EXISTS marketing_signups(email TEXT NOT NULL,purpose TEXT NOT NULL CHECK(purpose IN ('newsletter','free-lesson','book')),consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,unsubscribe_hash TEXT NOT NULL UNIQUE,unsubscribed_at TEXT,PRIMARY KEY(email,purpose))");
 // Preserve old waiting-list data without reviving anyone who later unsubscribed.
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='email_waitlist'").get()){
  const insert=db.prepare('INSERT OR IGNORE INTO marketing_signups(email,purpose,consent_at,unsubscribe_hash) VALUES(?,?,?,?)');
  db.transaction(()=>{
   for(const row of db.prepare('SELECT email,purpose,consent_at FROM email_waitlist').all()){
    if(purposes.has(row.purpose)&&emailPattern.test(row.email))insert.run(row.email,row.purpose,row.consent_at,digest(randomToken()));
   }
  })();
 }
 const get=db.prepare('SELECT email,purpose,unsubscribed_at FROM marketing_signups WHERE email=? AND purpose=?');
 const put=db.prepare('INSERT INTO marketing_signups(email,purpose,consent_at,unsubscribe_hash,unsubscribed_at) VALUES(?,?,CURRENT_TIMESTAMP,?,NULL) ON CONFLICT(email,purpose) DO UPDATE SET consent_at=CURRENT_TIMESTAMP,unsubscribe_hash=excluded.unsubscribe_hash,unsubscribed_at=NULL');
 const origin=process.env.SITE_ORIGIN||'http://localhost:3000';
 app.post('/api/subscribe',(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();
  const purpose=String(req.body?.purpose||'');
  if(email.length>254||!emailPattern.test(email)||!purposes.has(purpose)||req.body?.consent!==true)return res.status(400).json({error:'Valid email, subscription type and explicit consent are required'});
  const row=get.get(email,purpose);
  // Avoid repeated confirmation emails for the same consent; no data is disclosed.
  const fresh=!row||Boolean(row.unsubscribed_at);
  if(fresh){
   const token=randomToken(),hash=digest(token);
   db.transaction(()=>put.run(email,purpose,hash))();
   const purposeText=purpose==='newsletter'?'school news':purpose==='book'?'book updates':'free-lesson updates';
   const unsubscribeUrl=new URL('/#/unsubscribe/'+token,origin).toString();
   mail.notify(email,'marketing:consent:'+purpose+':'+hash,'Legwork · Subscription preference saved','You signed up to receive '+purposeText+' from Legwork.\n\nIf this was not you, or you no longer want these emails, unsubscribe here:\n'+unsubscribeUrl);
  }
  res.status(fresh?201:200).json({ok:true,delivery_enabled:mail.enabled,message:mail.enabled?'Your email preference was saved. Please check your inbox for a confirmation.':'Your request was saved. Outgoing emails will be available once the school configures its mail service.'});
 });
 app.post('/api/subscriptions/unsubscribe',(req,res)=>{
  const token=req.body?.token;
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return res.status(400).json({error:'Invalid unsubscribe link'});
  // Keep a non-personal tombstone to prevent an outdated migration from re-enabling consent.
  db.prepare('UPDATE marketing_signups SET unsubscribed_at=CURRENT_TIMESTAMP WHERE unsubscribe_hash=? AND unsubscribed_at IS NULL').run(digest(token));
  res.json({ok:true,message:'If this subscription was active, it has now been cancelled.'});
 });
 app.get('/api/admin/waitlist',auth,admin,(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.json({entries:db.prepare('SELECT email,purpose,consent_at FROM marketing_signups WHERE unsubscribed_at IS NULL ORDER BY consent_at DESC LIMIT 500').all()});
 });
 app.get('/api/admin/marketing-stats',auth,admin,(req,res)=>{
  res.json({by_purpose:db.prepare("SELECT purpose,COUNT(*) AS active FROM marketing_signups WHERE unsubscribed_at IS NULL GROUP BY purpose").all()});
 });
}
