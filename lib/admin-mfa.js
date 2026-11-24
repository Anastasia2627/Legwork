import crypto from 'node:crypto';
/** TOTP RFC6238, AES-GCM secret storage, atomic replay prevention, 8 one-use recovery codes. */
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let bits=0,v=0,out='';for(const b of bytes){v=(v<<8)|b;bits+=8;while(bits>=5)out+=alphabet[(v>>>(bits-=5))&31]}if(bits)out+=alphabet[(v<<(5-bits))&31];return out}
function decode(secret){let bits=0,v=0,out=[];for(const c of secret){const n=alphabet.indexOf(c);if(n<0)throw Error('Bad secret');v=(v<<5)|n;bits+=5;if(bits>=8){bits-=8;out.push((v>>bits)&255)}}return Buffer.from(out)}
export function totp(secret,time=Date.now(),shift=0){const n=BigInt(Math.floor(time/30000)+shift);if(n<0n)return null;const b=Buffer.alloc(8);b.writeBigUInt64BE(n);const mac=crypto.createHmac('sha1',decode(secret)).update(b).digest(),i=mac[19]&15;return String((mac.readUInt32BE(i)&0x7fffffff)%1000000).padStart(6,'0')}
const norm=s=>typeof s==='string'?s.replace(/[\s-]/g,'').toUpperCase():'';
const digest=s=>crypto.createHash('sha256').update('legwork-mfa-recovery-v1:'+s).digest('hex');

export function registerAdminMfa(app,db,{auth,admin,verifyPassword,tokenHash}){
 db.exec("CREATE TABLE IF NOT EXISTS admin_mfa(user_id INTEGER PRIMARY KEY REFERENCES users(id),secret TEXT NOT NULL,last_counter INTEGER NOT NULL DEFAULT -1,enabled_at INTEGER NOT NULL);"+
  "CREATE TABLE IF NOT EXISTS admin_mfa_setup(user_id INTEGER PRIMARY KEY REFERENCES users(id),secret TEXT NOT NULL,expires_at INTEGER NOT NULL);"+
  "CREATE TABLE IF NOT EXISTS admin_mfa_codes(user_id INTEGER REFERENCES users(id),digest TEXT NOT NULL,PRIMARY KEY(user_id,digest))");
 const encryptionKey=()=>{const secret=process.env.SESSION_SECRET||'';if(secret.length<32)throw Error('MFA requires a stable 32+ character session secret');return Buffer.from(crypto.hkdfSync('sha256',Buffer.from(secret),Buffer.from('legwork-mfa-v1'),Buffer.from('authenticator'),32))};
 const encrypt=s=>{const key=encryptionKey(),iv=crypto.randomBytes(12);try{const c=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64')}finally{key.fill(0)}};
 const decrypt=s=>{const key=encryptionKey();try{const data=Buffer.from(s,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(0,12));d.setAuthTag(data.subarray(12,28));return Buffer.concat([d.update(data.subarray(28)),d.final()]).toString()}finally{key.fill(0)}};
 const active=id=>db.prepare('SELECT * FROM admin_mfa WHERE user_id=?').get(id);
 const validPassword=(id,password)=>typeof password==='string'&&password.length<=128&&password.length>0&&verifyPassword(password,db.prepare("SELECT password_hash FROM users WHERE id=? AND role='admin'").get(id)?.password_hash);
 const counterFor=(s,c)=>{if(!/^\d{6}$/.test(c))return null;for(const shift of [-1,0,1])if(totp(s,Date.now(),shift)===c)return Math.floor(Date.now()/30000)+shift;return null};
 const verifyLogin=(user,input)=>{
  const record=active(user.id);if(!record)return true;
  const code=norm(input);
  if(/^\d{6}$/.test(code)){try{const n=counterFor(decrypt(record.secret),code);return n!==null&&n>record.last_counter&&db.prepare('UPDATE admin_mfa SET last_counter=? WHERE user_id=? AND last_counter<?').run(n,user.id,n).changes===1}catch{return false}}
  if(/^[A-F0-9]{20}$/.test(code))return db.prepare('DELETE FROM admin_mfa_codes WHERE user_id=? AND digest=?').run(user.id,digest(code)).changes===1;
  return false;
 };
 const newCodes=()=>Array.from({length:8},()=>crypto.randomBytes(10).toString('hex').toUpperCase().match(/.{5}/g).join('-'));
 const saveCodes=(id,codes)=>{db.prepare('DELETE FROM admin_mfa_codes WHERE user_id=?').run(id);const add=db.prepare('INSERT INTO admin_mfa_codes(user_id,digest) VALUES(?,?)');for(const c of codes)add.run(id,digest(norm(c)))};
 const safe=res=>res.set('Cache-Control','private, no-store');
 app.get('/api/admin/mfa/status',auth,admin,(req,res)=>{safe(res);res.json({enabled:!!active(req.user.id),recovery_remaining:db.prepare('SELECT COUNT(*) n FROM admin_mfa_codes WHERE user_id=?').get(req.user.id).n})});
 app.post('/api/admin/mfa/setup',auth,admin,(req,res)=>{
  safe(res);
  if(!validPassword(req.user.id,req.body?.password))return res.status(403).json({error:'Administrator password required'});
  if(active(req.user.id))return res.status(409).json({error:'Two-factor authentication already active'});
  const secret=base32(crypto.randomBytes(20)),expires=Date.now()+600_000;
  try{db.prepare('INSERT INTO admin_mfa_setup(user_id,secret,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret,expires_at=excluded.expires_at').run(req.user.id,encrypt(secret),expires)}
  catch{return res.status(503).json({error:'Authenticator setup unavailable'})}
  res.json({secret,otpauth_uri:'otpauth://totp/LEGWORK:Admin?secret='+secret+'&issuer=LEGWORK&algorithm=SHA1&digits=6&period=30',expires_at:expires});
 });
 app.post('/api/admin/mfa/enable',auth,admin,(req,res)=>{
  safe(res);
  if(!validPassword(req.user.id,req.body?.password))return res.status(403).json({error:'Administrator password required'});
  if(active(req.user.id))return res.status(409).json({error:'MFA already enabled'});
  const row=db.prepare('SELECT * FROM admin_mfa_setup WHERE user_id=?').get(req.user.id);
  if(!row||row.expires_at<Date.now())return res.status(410).json({error:'Setup expired'});
  let counter;try{counter=counterFor(decrypt(row.secret),norm(req.body?.otp))}catch{return res.status(503).json({error:'Cannot verify authenticator setup'})}
  if(counter===null)return res.status(403).json({error:'Incorrect authenticator code'});
  const recovery=newCodes();
  db.transaction(()=>{
   db.prepare('INSERT INTO admin_mfa(user_id,secret,last_counter,enabled_at) VALUES(?,?,?,?)').run(req.user.id,row.secret,counter,Date.now());
   saveCodes(req.user.id,recovery);
   db.prepare('DELETE FROM admin_mfa_setup WHERE user_id=?').run(req.user.id);
   const raw=/\blegwork_session=([a-f0-9]{64})\b/.exec(req.headers.cookie||'')?.[1];
   if(raw)db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(req.user.id,tokenHash(raw));
  })();
  res.json({ok:true,recovery_codes:recovery,warning:'Save these one-time codes offline. They are never shown again.'});
 });
 app.post('/api/admin/mfa/disable',auth,admin,(req,res)=>{
  safe(res);
  if(!validPassword(req.user.id,req.body?.password))return res.status(403).json({error:'Administrator password required'});
  if(!active(req.user.id))return res.status(409).json({error:'MFA is not enabled'});
  if(!verifyLogin(req.user,req.body?.otp))return res.status(403).json({error:'Authenticator or recovery code required'});
  db.transaction(()=>{
   db.prepare('DELETE FROM admin_mfa_codes WHERE user_id=?').run(req.user.id);
   db.prepare('DELETE FROM admin_mfa_setup WHERE user_id=?').run(req.user.id);
   db.prepare('DELETE FROM admin_mfa WHERE user_id=?').run(req.user.id);
   db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);
  })();
  res.json({ok:true,message:'MFA disabled; all admin sessions revoked'});
 });
 return {verifyLogin};
}
