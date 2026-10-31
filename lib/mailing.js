import crypto from 'node:crypto';
import fs from 'node:fs';
import nodemailer from 'nodemailer';

const emailPattern=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const hash=(value,secret)=>crypto.createHmac('sha256',secret).update(value).digest('hex');
const now=()=>Math.floor(Date.now()/1000);
const newCode=()=>crypto.randomBytes(32).toString('hex');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createMailService(app,db,{auth,hashPassword,cleanText}){
 const secret=process.env.SESSION_SECRET||'';
 const inTest=process.env.NODE_ENV==='test'&&!!process.env.MAIL_TEST_OUTBOX_PATH;
 const smtp=!!(process.env.SMTP_HOST&&process.env.SMTP_FROM&&process.env.SMTP_PORT&&((process.env.SMTP_USER&&process.env.SMTP_PASSWORD)||process.env.SMTP_NO_AUTH==='true'));
 const enabled=(smtp||inTest)&&secret.length>=32;
 const base=process.env.SITE_ORIGIN||'http://localhost:3000';
 let transport=null;
 if(smtp&&enabled&&!inTest){
  transport=nodemailer.createTransport({
   host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT),
   secure:process.env.SMTP_SECURE==='true',
   auth:process.env.SMTP_NO_AUTH==='true'?undefined:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},
   requireTLS:process.env.SMTP_SECURE==='true'?false:true,
   tls:{rejectUnauthorized:true},
   connectionTimeout:15000,greetingTimeout:15000,socketTimeout:25000
  });
 }
 const from=process.env.SMTP_FROM||'Legwork <test@legwork.example>';
 const encryptionKey=crypto.createHash('sha256').update('legwork-outbox-v1:'+secret).digest();
 const encrypt=text=>{
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey,iv);
  const buf=Buffer.concat([cipher.update(String(text),'utf8'),cipher.final()]);
  return [iv.toString('hex'),cipher.getAuthTag().toString('hex'),buf.toString('hex')].join('.');
 };
 const decrypt=blob=>{
  const [iv,tag,data]=blob.split('.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(iv,'hex'));
  decipher.setAuthTag(Buffer.from(tag,'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data,'hex')),decipher.final()]).toString('utf8');
 };
 db.exec([
  'CREATE TABLE IF NOT EXISTS email_tokens(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,purpose TEXT NOT NULL CHECK(purpose IN (\'verify\',\'reset\')),token_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS email_tokens_user_purpose ON email_tokens(user_id,purpose,created_at)',
  'CREATE TABLE IF NOT EXISTS mail_outbox(id INTEGER PRIMARY KEY,recipient TEXT NOT NULL,event_key TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT "pending",attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL,created_at INTEGER NOT NULL,sent_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS mail_outbox_ready ON mail_outbox(status,next_attempt)'
 ].join(';')+';');
 if(!db.pragma('table_info(users)').some(c=>c.name==='email_verified_at'))db.exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER');
 db.prepare("UPDATE users SET email_verified_at=? WHERE role='admin' AND email_verified_at IS NULL").run(now());
 const generic='If the address is registered, an email will be sent if delivery is configured.';
 let sending=false;
 const queue=(recipient,eventKey,subject,text)=>{
  if(!enabled||!emailPattern.test(String(recipient)))return false;
  const body=encrypt(JSON.stringify({subject,text}));
  db.prepare('INSERT OR IGNORE INTO mail_outbox(recipient,event_key,payload,next_attempt,created_at) VALUES(?,?,?,?,?)').run(recipient,eventKey,body,now(),now());
  setImmediate(()=>{dispatch().catch(err=>console.error('Mail outbox worker:',err.code||'query error'))});
  return true;
 };
 async function dispatch(){
  if(sending||!enabled)return;
  sending=true;
  try{
   const entries=db.prepare('SELECT * FROM mail_outbox WHERE status=\'pending\' AND next_attempt<=? AND attempts<8 ORDER BY id LIMIT 12').all(now());
   for(const item of entries){
    try{
     const {subject,text}=JSON.parse(decrypt(item.payload));
     if(inTest){
      fs.appendFileSync(process.env.MAIL_TEST_OUTBOX_PATH,JSON.stringify({to:item.recipient,subject,text})+'\n',{encoding:'utf8',mode:0o600});
     }else await transport.sendMail({from,to:item.recipient,subject,text,disableFileAccess:true,disableUrlAccess:true});
     db.prepare('UPDATE mail_outbox SET status=\'sent\',payload=\'\',sent_at=?,attempts=attempts+1 WHERE id=? AND status="pending"').run(now(),item.id);
    }catch{
     const attempts=item.attempts+1;
     db.prepare('UPDATE mail_outbox SET attempts=?,next_attempt=?,status=? WHERE id=?').run(attempts,now()+Math.min(3600,30*2**Math.min(attempts,7)),attempts>=8?'failed':'pending',item.id);
    }
   }
  }finally{sending=false}
 }
 if(enabled){const worker=setInterval(()=>dispatch().catch(err=>console.error('Mail outbox worker:',err.code||'query error')),15000);worker.unref();setImmediate(()=>dispatch().catch(err=>console.error('Mail outbox worker:',err.code||'query error')))}
 const link=fragment=>new URL('/#/'+fragment,base).toString();
 const issue=(user,purpose)=>{
  if(!enabled||!user||user.role==='admin')return false;
  const last=db.prepare('SELECT created_at FROM email_tokens WHERE user_id=? AND purpose=? ORDER BY created_at DESC LIMIT 1').get(user.id,purpose)?.created_at;
  const daily=db.prepare('SELECT COUNT(*) n FROM email_tokens WHERE user_id=? AND purpose=? AND created_at>?').get(user.id,purpose,now()-86400).n;
  if((last&&now()-last<600)||daily>=4)return false;
  const token=newCode(),ttl=purpose==='verify'?86400:1800;
  db.transaction(()=>{
   db.prepare('UPDATE email_tokens SET used_at=? WHERE user_id=? AND purpose=? AND used_at IS NULL').run(now(),user.id,purpose);
   db.prepare('INSERT INTO email_tokens(user_id,purpose,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)').run(user.id,purpose,hash(purpose+':'+token,secret),now(),now()+ttl);
  })();
  const url=link(purpose==='verify'?'verify-email/'+token:'reset-password/'+token);
  const message=purpose==='verify'?'Confirm your email to activate your Legwork account. This link expires in 24 hours.':'Reset your Legwork password. This link expires in 30 minutes. If you did not request it, you can safely ignore this email.';
  queue(user.email,'auth:'+purpose+':'+user.id+':'+hash(token,secret),'Legwork · '+(purpose==='verify'?'Verify your email':'Reset your password'),message+'\n\n'+url+'\n\nNever share this link.');
  return true;
 };
 const safeToken=t=>typeof t==='string'&&/^[a-f0-9]{64}$/.test(t);
 const consume=(purpose,token,password)=>{
  if(!safeToken(token))return {ok:false};
  const record=db.prepare('SELECT t.id,t.user_id,u.role FROM email_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.purpose=? AND t.used_at IS NULL AND t.expires_at>?').get(hash(purpose+':'+token,secret),purpose,now());
  if(!record||record.role==='admin')return {ok:false};
  if(purpose==='reset'&&(typeof password!=='string'||password.length<12||password.length>128))return {ok:false,password:true};
  db.transaction(()=>{
   const result=db.prepare('UPDATE email_tokens SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?').run(now(),record.id,now());
   if(result.changes!==1)throw Error('Token already used');
   if(purpose==='verify')db.prepare('UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=?').run(now(),record.user_id);
   else{
    db.prepare('UPDATE users SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?) WHERE id=?').run(hashPassword(password),now(),record.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(record.user_id);
    db.prepare('UPDATE email_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').run(now(),record.user_id);
   }
  })();
  return {ok:true};
 };
 function requireVerified(req,res,next){
  if(!enabled||req.user?.role==='admin')return next();
  const u=db.prepare('SELECT email_verified_at FROM users WHERE id=?').get(req.user.id);
  if(u?.email_verified_at)return next();
  return res.status(403).json({error:'Please verify your email before making purchases or submitting mentorship requests',code:'EMAIL_UNVERIFIED'});
 }
 const signup=user=>issue(user,'verify');
 const notify=(to,eventKey,subject,message)=>queue(to,eventKey,subject,message);
 app.get('/api/email/config',(req,res)=>res.json({enabled,verification_required:enabled}));
 app.get('/api/account/email-status',auth,(req,res)=>{
  const user=db.prepare('SELECT email,email_verified_at,role FROM users WHERE id=?').get(req.user.id);
  res.json({email:user.email,verified:!!user.email_verified_at||user.role==='admin',delivery_enabled:enabled,verification_required:enabled&&user.role!=='admin'});
 });
 app.post('/api/auth/resend-verification',auth,(req,res)=>{
  if(!enabled)return res.status(503).json({error:'Email delivery is not configured'});
  const user=db.prepare('SELECT id,email,role,email_verified_at FROM users WHERE id=?').get(req.user.id);
  if(user.email_verified_at)return res.json({ok:true,message:'Email already verified'});
  if(!issue(user,'verify'))return res.status(429).json({error:'A link was sent recently; try again later'});
  res.json({ok:true,message:'Verification email queued'});
 });
 app.post('/api/auth/verify-email',(req,res)=>{
  try{const result=consume('verify',req.body?.token);
   if(!result.ok)return res.status(400).json({error:'Verification link is invalid or expired'});
   res.json({ok:true,message:'Email verified successfully'});
  }catch{return res.status(400).json({error:'Verification link already used'})}
 });
 app.post('/api/auth/forgot-password',(req,res)=>{
  const email=cleanText(req.body?.email,254).toLowerCase();
  if(!emailPattern.test(email))return res.status(400).json({error:'Enter a valid email address'});
  const user=db.prepare('SELECT id,email,role FROM users WHERE email=?').get(email);
  if(user&&user.role==='student')issue(user,'reset');
  res.json({ok:true,message:generic});
 });
 app.post('/api/auth/reset-password',(req,res)=>{
  try{
   const result=consume('reset',req.body?.token,req.body?.password);
   if(result.password)return res.status(400).json({error:'New password must have 12–128 characters'});
   if(!result.ok)return res.status(400).json({error:'Reset link is invalid or expired'});
   res.json({ok:true,message:'Password changed. Please log in with your new password.'});
  }catch{return res.status(400).json({error:'Reset link already used'})}
 });
 app.get('/api/admin/email-outbox',auth,(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Forbidden'}),(req,res)=>{
  res.json({enabled,stats:db.prepare('SELECT status,COUNT(*) n FROM mail_outbox GROUP BY status').all()});
 });
 return {enabled,requireVerified,signup,notify,dispatch};
}
