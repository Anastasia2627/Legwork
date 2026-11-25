import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {hashPassword,verifyPassword,newToken,tokenHash,cleanText,safeExternalUrl,youtubeVideoId} from './lib/security.js';
import {registerSecurityAudit} from './lib/security-audit.js';
import {registerOperationsRoutes} from './lib/operations.js';
import {registerAdminMfa} from './lib/admin-mfa.js';
import {registerExtraRoutes} from './lib/features.js';
import {registerRequestRoutes} from './lib/requests.js';
import {registerMarketingRoutes} from './lib/marketing.js';
import {registerSiteMediaRoutes} from './lib/site-media.js';
import {registerImageUploads,safePublicImageUrl} from './lib/image-upload.js';
import {registerAccountDataRoutes} from './lib/account-data.js';
import {registerLearningRoutes} from './lib/learning.js';
import {registerPrivateLearningRoutes,homeworkFilePath} from './lib/private-learning.js';
import {registerBundleRoutes} from './lib/bundles.js';
import {initMentorshipCommerce,registerMentorshipCommerceRoutes,createMentorshipWithQuote,verifyMentorshipManualPayment,mentorshipPaymentUnderReview} from './lib/mentorship-commerce.js';
import {initPayments,registerPaymentWebhook,registerPaymentRoutes,unavailablePendingOrder,conflictingPaymentAttempts} from './lib/payments.js';
import {createMailService,emailPattern} from './lib/mailing.js';
import {registerResendWebhooks,registerResendSuppressionAdminRoutes} from './lib/resend-webhook.js';
import {registerCertificateRoutes} from './lib/certificates.js';
import {registerEditorialRoutes} from './lib/editorial.js';
import {EDITORIAL_DEFAULTS} from './lib/editorial.js';
import {publicSeoModel,renderPublicSeo,sitemapXml,robotsText,seoIndexAllowed} from './lib/public-seo.js';
const app=express(),port=Number(process.env.PORT||3000),prod=process.env.NODE_ENV==='production',dbPath=process.env.DATABASE_PATH||'./data/legwork.sqlite';
const siteOrigin=(()=>{try{const u=new URL(process.env.SITE_ORIGIN||'http://localhost:3000');return u.pathname==='/'&&!u.username&&!u.password&&!u.search&&!u.hash?u.origin:null}catch{return null}})();
if(prod&&(!siteOrigin||!siteOrigin.startsWith('https://')))throw Error('Production SITE_ORIGIN must be a public HTTPS origin without a path');
const indexingEnabled=prod&&process.env.PUBLIC_INDEXING_ENABLED==='true'&&!!siteOrigin;
app.set('trust proxy',Number(process.env.TRUST_PROXY_HOPS||0));
fs.mkdirSync(path.dirname(dbPath),{recursive:true});const db=new Database(dbPath);db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
const schema=[
'CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT "student",instagram TEXT DEFAULT "")',
'CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL)',
'CREATE TABLE IF NOT EXISTS courses(id INTEGER PRIMARY KEY,slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT "",price INTEGER NOT NULL DEFAULT 16000,active INTEGER NOT NULL DEFAULT 1)',
'CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,course_id INTEGER NOT NULL REFERENCES courses(id),title TEXT NOT NULL,category TEXT DEFAULT "Legwork",kind TEXT DEFAULT "Element",level TEXT DEFAULT "Beginner",duration INTEGER DEFAULT 12,price INTEGER DEFAULT 1500,video_url TEXT,cover_url TEXT NOT NULL DEFAULT "",free INTEGER DEFAULT 0,sort_order INTEGER DEFAULT 0,published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1)))',
'CREATE TABLE IF NOT EXISTS enrollments(user_id INTEGER REFERENCES users(id),course_id INTEGER REFERENCES courses(id),PRIMARY KEY(user_id,course_id))',
'CREATE TABLE IF NOT EXISTS lesson_access(user_id INTEGER REFERENCES users(id),lesson_id INTEGER REFERENCES lessons(id),PRIMARY KEY(user_id,lesson_id))',
'CREATE TABLE IF NOT EXISTS progress(user_id INTEGER REFERENCES users(id),lesson_id INTEGER REFERENCES lessons(id),completed INTEGER DEFAULT 0,homework_url TEXT,PRIMARY KEY(user_id,lesson_id))',
'CREATE TABLE IF NOT EXISTS mentorships(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),package TEXT NOT NULL,video_url TEXT NOT NULL,experience TEXT DEFAULT "",goals TEXT DEFAULT "",status TEXT DEFAULT "awaiting_payment",feedback TEXT DEFAULT "",created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
'CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),kind TEXT NOT NULL,item_id INTEGER,amount INTEGER NOT NULL,status TEXT DEFAULT "pending",created_at TEXT DEFAULT CURRENT_TIMESTAMP)'
];for(const sql of schema)db.exec(sql);
// Add media metadata in-place for existing SQLite databases. No data is deleted.
if(!db.pragma('table_info(lessons)').some(column=>column.name==='cover_url'))db.exec("ALTER TABLE lessons ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''");
// Keep all existing lessons visible; only explicitly created drafts are hidden.
if(!db.pragma('table_info(lessons)').some(column=>column.name==='published'))db.exec('ALTER TABLE lessons ADD COLUMN published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1))');
db.prepare('INSERT OR IGNORE INTO courses(slug,title,description,price) VALUES(?,?,?,?)').run('legwork-lab','Legwork Lab','Improve your legwork without exhausting stretching.',16000);
const c=db.prepare('SELECT id FROM courses WHERE slug=?').get('legwork-lab');if(!db.prepare('SELECT COUNT(*) n FROM lessons').get().n){const add=db.prepare('INSERT INTO lessons(course_id,title,category,kind,level,duration,price,free,sort_order) VALUES(?,?,?,?,?,?,?,?,?)');['Prestart · The basics','Warm-up for ankles','Flexi Legs foundation','Point your feet','Knee Circle','Leg Wave','Hip mobility','Floorwork fundamentals','Beautiful transitions','Knee balance','Extended lines','Power and control','Advanced leg circles','Wave combinations','Floor flow','Musicality','Choreography practice','Signature movement','Final routine','Recovery','Technique notes','Practice checklist','Final challenge'].forEach((name,i)=>add.run(c.id,name,i<4?'Warm-up':i<14?'Legwork':'Floor work',i<4?'Warm-up':'Element',i<7?'Beginner':i<17?'Intermediate':'Advanced',10+i%8,1500,i===0?1:0,i+1))}
initPayments(db);
initMentorshipCommerce(db);
const secret=process.env.ADMIN_PASSWORD;if(secret&&secret.length>=12&&!secret.startsWith('REPLACE_')&&!db.prepare("SELECT 1 FROM users WHERE role='admin'").get())db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run('admin@legwork.local','Admin',hashPassword(secret),'admin');else if(!secret)console.warn('Set ADMIN_PASSWORD in environment to create admin');
if(prod&&!process.env.SITE_ORIGIN)throw Error('SITE_ORIGIN must be set to the HTTPS public origin in production');
if(prod&&(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32||process.env.SESSION_SECRET.startsWith('REPLACE_')))throw Error('Set a unique SESSION_SECRET of at least 32 characters for production');
app.disable('x-powered-by');app.use(helmet({referrerPolicy:{policy:'strict-origin-when-cross-origin'},contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["\u0027self\u0027","https://fonts.googleapis.com"],fontSrc:["\u0027self\u0027","https://fonts.gstatic.com"],styleSrcAttr:["\u0027unsafe-inline\u0027"],imgSrc:["'self'","data:","https:"],mediaSrc:["'self'","https:","blob:"],frameSrc:["'self'","https://www.youtube-nocookie.com"],formAction:["'self'","https://secure.wayforpay.com"],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:prod?[]:null}}}));app.use('/api/email/resend/webhook',express.raw({type:'application/json',limit:'64kb'}));app.use(express.json({limit:'100kb'}));
// Prices are integer USD cents. Reject NaN, fractional/negative prices and
// unrealistic values at creation just as strictly as at editing/checkout.
const validCents=value=>Number.isSafeInteger(value)&&value>=0&&value<=100000000;
const validLessonMinutes=value=>Number.isSafeInteger(value)&&value>=1&&value<=600;
const validLessonOrder=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000;
const e2eRateMultiplier=process.env.NODE_ENV==='test'&&process.env.E2E_RATE_LIMIT_MULTIPLIER==='20'?20:1;
const jsonRateLimit=(limit,windowMs)=>rateLimit({windowMs,limit:limit*e2eRateMultiplier,standardHeaders:'draft-7',legacyHeaders:false,handler:(req,res)=>res.status(429).json({error:'Too many requests. Please try again in a moment.'})});
app.use('/api/auth/login',jsonRateLimit(8,15*60*1000));
app.use(['/api/account/change-password','/api/account/sessions/revoke-others','/api/account/deletion-request'],jsonRateLimit(8,15*60*1000));
app.use('/api/admin/mfa',jsonRateLimit(8,15*60*1000));
app.use('/api/auth',jsonRateLimit(30,15*60*1000));
const apiReadLimiter=jsonRateLimit(1200,60*1000),apiWriteLimiter=jsonRateLimit(180,60*1000);
app.use('/api',(req,res,next)=>{res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Cache-Control','private, no-store');next()});
app.use('/api',(req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?apiReadLimiter(req,res,next):apiWriteLimiter(req,res,next));
const audit=registerSecurityAudit(app,db,{getUser:req=>current(req)});
app.use('/api',(req,res,next)=>{
 if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
 // Exact signed provider endpoints authenticate their requests independently.
 if(req.method==='POST'&&['/payments/wayforpay/webhook','/email/resend/webhook'].includes(req.path))return next();
 if(req.get('sec-fetch-site')==='cross-site')return res.status(403).json({error:'Invalid origin'});
 const configured=process.env.SITE_ORIGIN;
 let expected,source;
 try{
  expected=new URL(configured||'http://'+req.get('host')).origin;
  const origin=req.get('origin'),referer=req.get('referer');
  if(origin){if(origin==='null')return res.status(403).json({error:'Invalid origin'});source=new URL(origin).origin}
  else if(referer)source=new URL(referer).origin;
  else if(prod)return res.status(403).json({error:'Origin or Referer required'});
 }catch{return res.status(403).json({error:'Invalid origin'})}
 if(source&&source!==expected)return res.status(403).json({error:'Invalid origin'});
 next();
});
registerPaymentWebhook(app,db,()=>mail);

const cookie=(t,maxAge=604800)=>'legwork_session='+t+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+maxAge+(prod?'; Secure':'');
const current=req=>{const token=/\blegwork_session=([a-f0-9]{64})\b/.exec(req.headers.cookie||'')?.[1];return token?db.prepare('SELECT u.id,u.email,u.name,u.instagram,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(tokenHash(token),Date.now()):null};
const auth=(req,res,next)=>{req.user=current(req);return req.user?next():res.status(401).json({error:'Please log in'})};const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Forbidden'});
const mfa=registerAdminMfa(app,db,{auth,admin,verifyPassword,tokenHash});
const mail=createMailService(app,db,{auth,hashPassword,cleanText});
registerResendWebhooks(app,db,{secret:process.env.RESEND_WEBHOOK_SECRET});

registerResendSuppressionAdminRoutes(app,db,{auth,admin,verifyPassword});
registerMentorshipCommerceRoutes(app,db,{auth,admin});
audit.registerRoutes(auth,admin);
if(prod&&!mail.registrationOpen)console.warn('Public registration closed until email delivery is verified and REGISTRATION_OPEN=true');
db.exec('CREATE INDEX IF NOT EXISTS sessions_user_expiry_idx ON sessions(user_id,expires_at DESC)');
const login=(u,res)=>{
 const token=newToken(),digest=tokenHash(token),ttlSeconds=u.role==='admin'?43200:604800;
 db.transaction(()=>{
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest,u.id,Date.now()+ttlSeconds*1000);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT 4)').run(u.id,u.id);
 })();
 res.setHeader('Set-Cookie',cookie(token,ttlSeconds));
 res.setHeader('Cache-Control','private, no-store');
 res.json({user:{id:u.id,name:u.name,email:u.email,role:u.role}});
};
app.get('/api/me',(req,res)=>res.json({user:current(req)||null}));
app.post('/api/auth/register',(req,res)=>{
 if(prod&&!mail.registrationOpen)return res.status(503).json({error:'Student registration is not yet open. Email delivery must be verified first.'});
 const body=req.body||{},name=typeof body.name==='string'?body.name.trim():'',email=typeof body.email==='string'?body.email.trim().toLowerCase():'',password=body.password;
 if(!name||name.length>80||email.length>254||!emailPattern.test(email)||typeof password!=='string'||password.length<12||password.length>128)return res.status(400).json({error:'Name, valid email and 12–128 character password required'});
 let user;
 try{
  user=db.transaction(()=>{
   const result=db.prepare('INSERT INTO users(email,name,password_hash) VALUES(?,?,?)').run(email,name,hashPassword(password));
   const created={id:Number(result.lastInsertRowid),email,name,role:'student'};
   mail.signup(created,true);
   return created;
  })();
 }catch(err){
  if(String(err.code||'').includes('CONSTRAINT_UNIQUE')||/UNIQUE constraint failed: users.email/i.test(String(err.message||'')))return res.status(409).json({error:'Email already registered'});
  throw err;
 }
 login(user,res);
});
const dummyLoginHash=hashPassword('not-an-actual-login-account','0123456789abcdef0123456789abcdef');
app.post('/api/auth/login',(req,res)=>{
 const id=cleanText(req.body?.email,254).toLowerCase(),p=req.body?.password;
 if(typeof p!=='string'||p.length>128||!p.length)return res.status(401).json({error:'Invalid credentials'});
 const u=id==='admin'?db.prepare("SELECT * FROM users WHERE role='admin'").get():db.prepare('SELECT * FROM users WHERE email=?').get(id);
 const valid=verifyPassword(p,u?.password_hash||dummyLoginHash);
 if(valid&&u){
  if(u.role==='admin'&&!mfa.verifyLogin(u,req.body?.otp)){
   audit.record({actorId:u.id,action:'auth.mfa_rejected',targetType:'account',targetId:String(u.id),outcome:'denied',status:401});
   return res.status(401).json({error:'Admin authenticator or backup code required',mfa_required:true});
  }
  audit.record({actorId:u.id,action:'auth.login',targetType:'account',targetId:String(u.id),outcome:'success',status:200});
  return login(u,res);
 }
 audit.record({actorId:u?.id||null,action:'auth.login_rejected',targetType:'account',targetId:u?String(u.id):'',outcome:'denied',status:401});
 return res.status(401).json({error:'Invalid credentials'});
});
app.post('/api/auth/logout',(req,res)=>{const token=/\blegwork_session=([a-f0-9]{64})\b/.exec(req.headers.cookie||'')?.[1];if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));res.setHeader('Set-Cookie',cookie('',0));res.json({ok:true})});
app.get('/api/account/sessions',auth,(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 const active=db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=? AND expires_at>?').get(req.user.id,Date.now()).n;
 res.json({active_sessions:active,max_sessions:4});
});
app.post('/api/account/sessions/revoke-others',auth,(req,res)=>{
 const password=req.body?.password;
 if(typeof password!=='string'||password.length>128||!password)return res.status(400).json({error:'Enter your current password'});
 const user=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
 if(!user||!verifyPassword(password,user.password_hash))return res.status(403).json({error:'Current password is incorrect'});
 const token=/\blegwork_session=([a-f0-9]{64})\b/.exec(req.headers.cookie||'')?.[1];
 if(!token)return res.status(401).json({error:'Session expired'});
 const keep=tokenHash(token);
 const removed=db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(req.user.id,keep).changes;
 res.json({ok:true,revoked_sessions:removed,message:'Other devices have been signed out.'});
});
app.get('/api/courses',(req,res)=>res.json({courses:db.prepare('SELECT id,slug,title,description,price,guru_price FROM courses WHERE active=1').all()}));
app.get('/api/lessons',(req,res)=>res.json({lessons:db.prepare('SELECT l.id,l.course_id,l.title,l.category,l.kind,l.level,l.duration,l.price,l.free,l.sort_order,l.cover_url,l.tags,l.equipment,l.focus,l.teacher,c.slug FROM lessons l JOIN courses c ON c.id=l.course_id WHERE c.active=1 AND l.published=1 ORDER BY l.course_id,l.sort_order,l.id').all()}));
const access=(u,l)=>{
 if(!u)return false;
 if(u.role==='admin')return true;
 const course=db.prepare('SELECT active FROM courses WHERE id=?').get(l.course_id);
 if(l.published!==1||![1,2].includes(course?.active))return false;
 return (course.active===1&&l.free===1)||!!db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?').get(u.id,l.course_id)||!!db.prepare('SELECT 1 FROM lesson_access WHERE user_id=? AND lesson_id=?').get(u.id,l.id);
};
app.get('/api/lessons/:id/watch',(req,res)=>{const l=db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);if(!l)return res.status(404).json({error:'Not found'});const viewer=current(req);if(!viewer)return res.status(401).json({error:'Log in to watch lessons'});if(!access(viewer,l))return res.status(403).json({error:'Purchase required'});res.setHeader('Cache-Control','private, no-store');res.json({title:l.title,video_url:l.video_url})});
app.get('/api/dashboard',auth,(req,res)=>{const id=req.user.id;res.setHeader('Cache-Control','private, no-store');res.json({enrollments:db.prepare('SELECT c.*,e.tier FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=?').all(id),lessonAccess:db.prepare('SELECT lesson_id FROM lesson_access WHERE user_id=?').all(id).map(x=>x.lesson_id),archived_lessons:db.prepare('SELECT l.id,l.course_id,l.title,l.category,l.kind,l.level,l.duration,l.price,l.free,l.sort_order,l.cover_url,l.tags,l.equipment,l.focus,l.teacher,c.slug FROM lessons l JOIN courses c ON c.id=l.course_id WHERE c.active=2 AND l.published=1 AND (EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id=? AND e.course_id=l.course_id) OR EXISTS (SELECT 1 FROM lesson_access a WHERE a.user_id=? AND a.lesson_id=l.id)) ORDER BY l.course_id,l.sort_order,l.id').all(id,id),progress:db.prepare('SELECT * FROM progress WHERE user_id=?').all(id),mentorships:db.prepare('SELECT m.*,q.order_id,q.turnaround_business_days,o.amount AS quoted_price_cents,o.status AS order_status FROM mentorships m LEFT JOIN mentorship_order_quotes q ON q.mentorship_id=m.id LEFT JOIN orders o ON o.id=q.order_id WHERE m.user_id=? ORDER BY m.id DESC').all(id),orders:db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(id)})});
app.post('/api/progress/:id',auth,(req,res)=>{
 const l=db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);
 if(!l||!access(req.user,l))return res.status(403).json({error:'Forbidden'});
 if(db.prepare('SELECT 1 FROM certificates WHERE user_id=? AND course_id=? AND revoked_at IS NULL').get(req.user.id,l.course_id))
  return res.status(409).json({error:'A certificate has already been issued for this course. Contact support before changing completed work.'});
 const url=cleanText(req.body.homework_url,1000);
 const existingFile=db.prepare("SELECT id FROM private_learning_files WHERE kind='homework' AND owner_id=? AND lesson_id=?").get(req.user.id,l.id);
 const currentPrivate=homeworkFilePath(req.user.id,l.id);
 if(url&&!(url===currentPrivate&&existingFile)&&!safeExternalUrl(url))
  return res.status(400).json({error:'Invalid homework URL'});
 db.transaction(()=>{
  const existing=db.prepare('SELECT completed,homework_url FROM progress WHERE user_id=? AND lesson_id=?').get(req.user.id,l.id);
  const completed=req.body.completed===true?1:0;
  db.prepare('INSERT INTO progress(user_id,lesson_id,completed,homework_url) VALUES(?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET completed=excluded.completed,homework_url=excluded.homework_url')
   .run(req.user.id,l.id,completed,url);
  if(existingFile&&url!==currentPrivate)db.prepare('DELETE FROM private_learning_files WHERE id=?').run(existingFile.id);
  if(!existing||completed!==1||String(existing.homework_url||'')!==String(url||'')){
   db.prepare('UPDATE homework_reviews SET approved=0,approved_at=NULL,approved_by=NULL WHERE user_id=? AND lesson_id=?').run(req.user.id,l.id);
  }
 })();
 res.json({ok:true});
});
app.post('/api/orders',auth,mail.requireVerified,(req,res)=>{const kind=req.body?.kind,id=req.body?.item_id,plan=req.body?.plan??'self';if(!['course','lesson'].includes(kind)||!Number.isSafeInteger(id)||id<1||!['self','guru'].includes(plan))return res.status(400).json({error:'Invalid item'});if(kind==='lesson'&&req.body.plan==='guru')return res.status(400).json({error:'Plan not valid for this item'});const item=kind==='course'?db.prepare('SELECT price,guru_price FROM courses WHERE id=? AND active=1').get(id):db.prepare('SELECT l.price,l.free,l.course_id FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=? AND c.active=1 AND l.published=1').get(id);if(!item)return res.status(404).json({error:'Not found'});if(kind==='lesson'&&item.free===1)return res.status(409).json({error:'This lesson is already available for free'});const already=kind==='course'?db.prepare('SELECT tier FROM enrollments WHERE user_id=? AND course_id=?').get(req.user.id,id):!!(db.prepare('SELECT 1 FROM lesson_access WHERE user_id=? AND lesson_id=?').get(req.user.id,id)||db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?').get(req.user.id,item.course_id));
if(already&&(kind==='lesson'||already.tier==='guru'||plan==='self'))return res.status(409).json({error:'You already have access to this content'});
const amount=kind==='course'&&plan==='guru'?item.guru_price:item.price;if(!Number.isSafeInteger(amount)||amount<0)return res.status(500).json({error:'Invalid product price'});const existing=db.prepare("SELECT id FROM orders WHERE user_id=? AND kind=? AND item_id=? AND plan=? AND status='pending'").get(req.user.id,kind,id,plan);if(existing)return res.status(409).json({error:'This item already has a pending request'});const r=db.prepare('INSERT INTO orders(user_id,kind,item_id,amount,plan) VALUES(?,?,?,?,?)').run(req.user.id,kind,id,amount,plan);mail.notify(req.user.email,'order:requested:'+r.lastInsertRowid,'Legwork · Your order request was received','We saved your order request #'+r.lastInsertRowid+'. No payment has been taken and no access has been granted. The school will confirm payment and access separately.');res.status(201).json({id:r.lastInsertRowid,status:'pending',amount,message:'Request saved. No payment has been taken. Access only after verified payment and admin approval.'})});
app.post('/api/mentorships',auth,mail.requireVerified,(req,res)=>{
 const pack=req.body?.package,url=cleanText(req.body?.video_url,1000);
 if(!['Basic','Deep'].includes(pack)||!safeExternalUrl(url))
  return res.status(400).json({error:'Select Basic/Deep and provide a valid HTTPS video link'});
 let created;
 try{
  created=createMentorshipWithQuote(db,req.user.id,{
   package:pack,url,
   experience:pack==='Deep'?cleanText(req.body.experience,500):'',
   goals:cleanText(req.body.goals,1500),
   instagram:cleanText(req.body.instagram,80),
   training_frequency:pack==='Deep'?cleanText(req.body.training_frequency,100):'',
   teaching:pack==='Deep'?cleanText(req.body.teaching,100):''
  });
 }catch{return res.status(409).json({error:'Unable to create a consistent mentorship request'})}
 const quoted=created.quote;
 const details=quoted
  ? 'The approved package quote is '+(quoted.price_usd_cents/100).toFixed(2)+' USD with a stated response time of '+quoted.turnaround_business_days+' business days after payment verification. No charge occurred when submitting this request.'
  : 'The school has not published a fixed package price or response time. They must be confirmed before payment. No charge occurred.';
 mail.notify(req.user.email,'mentorship:requested:'+created.id,
  'Legwork · Your mentorship request was received',
  'We received your '+pack+' mentorship request #'+created.id+'. '+details);
 res.status(201).json({
  id:created.id,order_id:created.order_id,quote:quoted||null,
  message:quoted?'Request saved. Your quoted order is available in your account; no payment was taken.':'Request saved. The school will confirm price and payment details before charging you.'
 });
});
app.patch('/api/profile',auth,(req,res)=>{
 const body=req.body||{},name=typeof body.name==='string'?body.name.trim():'';
 if(!name||name.length>80||(body.instagram!==undefined&&(typeof body.instagram!=='string'||body.instagram.trim().length>80)))return res.status(400).json({error:'Enter a name and optional Instagram username of up to 80 characters'});
 const instagram=body.instagram===undefined?req.user.instagram||'':body.instagram.trim();
 db.prepare('UPDATE users SET name=?,instagram=? WHERE id=?').run(name,instagram,req.user.id);
 res.json({ok:true,profile:{name,instagram}});
});
app.get('/api/admin/overview',auth,admin,(req,res)=>res.json({users:db.prepare('SELECT id,email,name,role FROM users ORDER BY id DESC LIMIT 100').all(),orders:db.prepare('SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 100').all(),mentorships:db.prepare('SELECT m.*,u.email FROM mentorships m JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 100').all(),courses:db.prepare('SELECT * FROM courses').all(),lessons:db.prepare('SELECT * FROM lessons ORDER BY course_id,sort_order,id').all()}));
app.get('/api/admin/mentorship-queue',auth,admin,(req,res)=>{
 const statuses=['all','awaiting_payment','paid','answered','cancelled'];
 const status=String(req.query.status||'all'),limit=Number(req.query.limit||20),offset=Number(req.query.offset||0);
 if(!statuses.includes(status)||!Number.isSafeInteger(limit)||limit<1||limit>50||
    !Number.isSafeInteger(offset)||offset<0||offset>1000000)
  return res.status(400).json({error:'Invalid mentor request filters'});
 const where=status==='all'?'':' WHERE m.status=?';
 const params=status==='all'?[]:[status];
 const base=' FROM mentorships m JOIN users u ON u.id=m.user_id';
 const count=db.prepare('SELECT COUNT(*) n'+base+where).get(...params).n;
 const items=db.prepare('SELECT m.id,m.user_id,m.package,m.video_url,m.experience,m.goals,m.instagram,m.training_frequency,m.teaching,m.status,m.feedback,m.created_at,u.email,u.name,q.order_id,q.turnaround_business_days,o.amount AS quoted_price_cents,o.status AS order_status,EXISTS(SELECT 1 FROM payment_attempt_orders po JOIN payment_attempts pa ON pa.id=po.attempt_id WHERE po.order_id=q.order_id AND pa.status=\'review_required\') AS payment_review_required'+base+' LEFT JOIN mentorship_order_quotes q ON q.mentorship_id=m.id LEFT JOIN orders o ON o.id=q.order_id'+where+
  ' ORDER BY CASE m.status WHEN \'paid\' THEN 0 WHEN \'awaiting_payment\' THEN 1 WHEN \'answered\' THEN 2 ELSE 3 END,m.id DESC LIMIT ? OFFSET ?').all(...params,limit,offset);
 const totals=Object.fromEntries(statuses.map(s=>[s,Number(db.prepare('SELECT COUNT(*) n'+base+(s==='all'?'':' WHERE m.status=?')).get(...(s==='all'?[]:[s])).n)]));
 res.setHeader('Cache-Control','private, no-store');
 res.json({requests:items,status,offset,limit,count:Number(count),has_more:offset+items.length<count,totals});
});
app.post('/api/admin/enroll',auth,admin,(req,res)=>{const u=Number(req.body.user_id),c=Number(req.body.course_id);if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(u)||!db.prepare('SELECT 1 FROM courses WHERE id=? AND active=1').get(c))return res.status(404).json({error:'Published course or user not found'});db.prepare('INSERT OR IGNORE INTO enrollments(user_id,course_id,tier) VALUES(?,?,?)').run(u,c,req.body.tier==='guru'?'guru':'self');res.json({ok:true})});
app.post('/api/admin/orders/:id/approve',auth,admin,(req,res)=>{const o=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);if(!o||o.status!=='pending')return res.status(409).json({error:'Not pending'});if(o.kind==='mentorship')return res.status(409).json({error:'Verify mentorship payments in the mentor review queue, not through course order approval'});if(unavailablePendingOrder(db,o))return res.status(409).json({error:'This order is no longer eligible. Reconcile the original payment before granting access.'});const inFlight=db.prepare("SELECT 1 FROM payment_attempt_orders ao JOIN payment_attempts pa ON pa.id=ao.attempt_id WHERE ao.order_id=? AND pa.status IN ('pending','approved','review_required') LIMIT 1");if(inFlight.get(o.id)||conflictingPaymentAttempts(db,[o]).length)return res.status(409).json({error:'Payment is already in progress or requires reconciliation'});db.transaction(()=>{if(o.kind==='course'){db.prepare('INSERT INTO enrollments(user_id,course_id,tier) VALUES(?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET tier=CASE WHEN excluded.tier=\'guru\' THEN \'guru\' ELSE enrollments.tier END').run(o.user_id,o.item_id,o.plan==='guru'?'guru':'self')}else if(o.kind==='bundle'){const components=db.prepare('SELECT lesson_id FROM bundle_lessons WHERE bundle_id=?').all(o.item_id);if(!components.length)throw Error('Bundle has no lessons');for(const lesson of components)db.prepare('INSERT OR IGNORE INTO lesson_access(user_id,lesson_id) VALUES(?,?)').run(o.user_id,lesson.lesson_id)}else if(o.kind==='lesson'){db.prepare('INSERT OR IGNORE INTO lesson_access(user_id,lesson_id) VALUES(?,?)').run(o.user_id,o.item_id)}else throw Error('Unknown order type');db.prepare("UPDATE orders SET status='approved' WHERE id=?").run(o.id)})();const buyer=db.prepare('SELECT email FROM users WHERE id=?').get(o.user_id);if(buyer)mail.notify(buyer.email,'order:approved:'+o.id,'Legwork · Your course access is ready','Your order #'+o.id+' is approved. Open your Legwork student account to start learning.');res.json({ok:true})});
app.post('/api/admin/courses',auth,admin,(req,res)=>{
 const body=req.body||{},title=cleanText(body.title,120),slug=cleanText(body.slug,80).toLowerCase();
 const price=Number(body.price),guruPrice=body.guru_price===undefined?36000:Number(body.guru_price);
 if(body.draft!==undefined&&typeof body.draft!=='boolean')return res.status(400).json({error:'Draft must be a boolean'});
 if(!title||!/^[a-z0-9-]{2,80}$/.test(slug)||body.price===undefined||body.price===null||body.price===''||!validCents(price)||
    (body.guru_price!==undefined&&(body.guru_price===null||body.guru_price===''))||!validCents(guruPrice)){
  return res.status(400).json({error:'Provide a title, valid slug, and whole-number prices in USD cents (0–100000000)'});
 }
 try{
  const active=body.draft===true?0:1;
  const r=db.prepare('INSERT INTO courses(slug,title,description,price,guru_price,active) VALUES(?,?,?,?,?,?)')
   .run(slug,title,cleanText(body.description,1000),price,guruPrice,active);
  res.status(201).json({id:r.lastInsertRowid,active});
 }catch{return res.status(409).json({error:'Course slug already exists'})}
});
// Publication is intentionally one-way: taking a purchased course offline can
// strand students and pending orders. Existing active courses are unchanged.
app.post('/api/admin/courses/:id/publish',auth,admin,(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid course ID'});
 if(req.body?.confirm!==true)return res.status(400).json({error:'Explicit publication confirmation required'});
 const result=db.transaction(()=>{
  const c=db.prepare('SELECT * FROM courses WHERE id=?').get(id);
  if(!c)return {status:404,error:'Course not found'};
  if(c.active===1)return {status:200,active:1,already_published:true};
  if(c.active!==0)return {status:409,error:'Use Restore sales for an archived course'};
  const lessons=db.prepare('SELECT id,video_url,cover_url FROM lessons WHERE course_id=? AND published=1 ORDER BY sort_order,id').all(id);
  const missing=lessons.filter(l=>!l.video_url||!youtubeVideoId(l.video_url)||!l.cover_url||!safePublicImageUrl(l.cover_url,safeExternalUrl)).map(l=>l.id);
  if(!String(c.description||'').trim()||!lessons.length||missing.length||!validCents(c.price)||!validCents(c.guru_price))
   return {status:409,error:'Complete the course description, prices, and at least one approved lesson with valid video and cover URLs before publication. Draft lessons remain hidden.',missing_lesson_ids:missing};
  db.prepare('UPDATE courses SET active=1 WHERE id=? AND active=0').run(id);
  return {status:200,active:1,already_published:false};
 })();
 const {status,...body}=result;
 return res.status(status).json(body);
});
// active: 0 = draft, 1 = selling, 2 = archived (owned learning remains available).
// Never invalidate pending course, lesson or bundle orders or provider attempts.
app.post('/api/admin/courses/:id/archive',auth,admin,(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1||req.body?.confirm!==true)return res.status(400).json({error:'Valid course and explicit confirmation required'});
 const result=db.transaction(()=>{
  const course=db.prepare('SELECT active FROM courses WHERE id=?').get(id);
  if(!course)return {status:404,error:'Course not found'};
  if(course.active===2)return {status:200,active:2,already_archived:true};
  if(course.active!==1)return {status:409,error:'Only a published course can be archived'};
  const pending=db.prepare("SELECT COUNT(*) n FROM orders o WHERE (o.status='pending' OR EXISTS (SELECT 1 FROM payment_attempt_orders po JOIN payment_attempts pa ON pa.id=po.attempt_id WHERE po.order_id=o.id AND pa.status IN ('pending','review_required'))) AND ((o.kind='course' AND o.item_id=?) OR (o.kind='lesson' AND EXISTS (SELECT 1 FROM lessons l WHERE l.id=o.item_id AND l.course_id=?)) OR (o.kind='bundle' AND EXISTS (SELECT 1 FROM bundle_lessons bl JOIN lessons l ON l.id=bl.lesson_id WHERE bl.bundle_id=o.item_id AND l.course_id=?)))").get(id,id,id).n;
  if(pending)return {status:409,error:'Resolve pending orders and payment reviews before archiving this course.',pending_orders:Number(pending)};
  db.prepare('UPDATE courses SET active=2 WHERE id=? AND active=1').run(id);
  return {status:200,active:2,already_archived:false};
 })();
 const {status,...body}=result;
 return res.status(status).json(body);
});
app.post('/api/admin/courses/:id/restore',auth,admin,(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1||req.body?.confirm!==true)return res.status(400).json({error:'Valid course and explicit confirmation required'});
 const result=db.transaction(()=>{
  const c=db.prepare('SELECT active FROM courses WHERE id=?').get(id);
  if(!c)return {status:404,error:'Course not found'};
  if(c.active===1)return {status:200,active:1,already_restored:true};
  if(c.active!==2)return {status:409,error:'Only an archived course can be restored'};
  db.prepare('UPDATE courses SET active=1 WHERE id=? AND active=2').run(id);
  return {status:200,active:1,already_restored:false};
 })();
 const {status,...body}=result;
 return res.status(status).json(body);
});
app.post('/api/admin/lessons',auth,admin,(req,res)=>{
 const body=req.body||{},title=cleanText(body.title,120),url=cleanText(body.video_url,1000),
  cover=cleanText(body.cover_url,1000),course=Number(body.course_id),price=Number(body.price);
 if(body.draft!==undefined&&typeof body.draft!=='boolean')return res.status(400).json({error:'Draft must be a boolean'});
 const duration=body.duration===undefined?12:Number(body.duration);
 const order=body.sort_order===undefined?100:Number(body.sort_order);
 if(!title||!Number.isSafeInteger(course)||course<1||body.price===undefined||body.price===null||body.price===''||
    !validCents(price)||!validLessonMinutes(duration)||!validLessonOrder(order)||
    (body.duration!==undefined&&(body.duration===null||body.duration===''))||
    (body.sort_order!==undefined&&(body.sort_order===null||body.sort_order===''))||
    (url&&!youtubeVideoId(url))||(cover&&!safePublicImageUrl(cover,safeExternalUrl))||
    !db.prepare('SELECT 1 FROM courses WHERE id=?').get(course)){
  return res.status(400).json({error:'Invalid lesson: check course, integer price in cents, 1–600 minutes, image and YouTube URLs'});
 }
 if(body.draft!==true&&db.prepare('SELECT active FROM courses WHERE id=?').get(course)?.active===2)return res.status(409).json({error:'Restore course sales before publishing new lessons'});
 const published=body.draft===true?0:1;
 const r=db.prepare('INSERT INTO lessons(course_id,title,category,kind,level,duration,price,video_url,cover_url,free,sort_order,published) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(course,title,cleanText(body.category,50)||'Legwork',cleanText(body.kind,40)||'Element',
   cleanText(body.level,40)||'Beginner',duration,price,url,cover,body.free===true?1:0,order,published);
 res.status(201).json({id:r.lastInsertRowid,published});
});
// Apply an explicitly selected set of fields in a single transaction.
// No entitlement, media, title, free status or lesson order changes are allowed here.
app.post('/api/admin/lessons/bulk',auth,admin,(req,res)=>{
 const {lesson_ids:ids,changes={},publish=false,confirm}=req.body||{};
 const fields={category:50,kind:50,level:50,equipment:50,teacher:100,focus:80,tags:280};
 if(confirm!==true||!Array.isArray(ids)||ids.length<1||ids.length>50||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length||typeof publish!=='boolean'||!changes||typeof changes!=='object'||Array.isArray(changes))
  return res.status(400).json({error:'Select 1–50 distinct lessons and confirm the changes'});
 const patch={};
 for(const [key,value] of Object.entries(changes)){
  if(key==='price'){
   if(!validCents(value))return res.status(400).json({error:'Price must be whole USD cents between 0 and 100000000'});
   patch.price=value;
  }else if(Object.hasOwn(fields,key)){
   if(typeof value!=='string'||!value.trim()||value.trim().length>fields[key])return res.status(400).json({error:'Invalid bulk field: '+key});
   const cleaned=cleanText(value,fields[key]);
   if(!cleaned)return res.status(400).json({error:'Invalid bulk field: '+key});
   patch[key]=cleaned;
  }else return res.status(400).json({error:'Unsupported bulk field'});
 }
 const keys=Object.keys(patch);
 if(!keys.length&&!publish)return res.status(400).json({error:'Choose at least one field or publication'});
 const result=db.transaction(()=>{
  const get=db.prepare('SELECT l.*,c.active AS course_active FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=?');
  const rows=ids.map(id=>get.get(id));
  const missing=ids.filter((id,i)=>!rows[i]);
  if(missing.length)return {status:404,error:'One or more selected lessons no longer exist',lesson_ids:missing};
  const drafts=publish?rows.filter(l=>l.published!==1):[];
  const blocked=drafts.filter(l=>l.course_active===2||!String(l.title||'').trim()||!validCents(patch.price??l.price)||!validLessonMinutes(l.duration)||!youtubeVideoId(l.video_url)||!safePublicImageUrl(l.cover_url,safeExternalUrl));
  if(blocked.length)return {status:409,error:'No changes saved. Some drafts lack valid saved materials or belong to archived courses: '+blocked.map(l=>l.id).join(', '),lesson_ids:blocked.map(l=>l.id)};
  // Column names come only from the server-side allowlist.
  if(keys.length){
   const update=db.prepare('UPDATE lessons SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?');
   for(const row of rows)update.run(...keys.map(k=>patch[k]),row.id);
  }
  if(drafts.length){
   const approve=db.prepare('UPDATE lessons SET published=1 WHERE id=? AND published=0');
   for(const row of drafts)approve.run(row.id);
  }
  return {status:200,updated:keys.length?rows.length:0,published:drafts.length,lesson_ids:ids};
 })();
 const {status,...body}=result;
 res.setHeader('Cache-Control','private, no-store');
 return res.status(status).json(body);
});
// Publish saved materials only; there is deliberately no unpublish action.
app.post('/api/admin/lessons/:id/publish',auth,admin,(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid lesson ID'});
 if(req.body?.confirm!==true)return res.status(400).json({error:'Explicit publication confirmation required'});
 const result=db.transaction(()=>{
  const l=db.prepare('SELECT l.*,c.active AS course_active FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=?').get(id);
  if(!l)return {status:404,error:'Lesson not found'};
  if(l.published===1)return {status:200,published:1,already_published:true,course_active:l.course_active};
  if(l.course_active===2)return {status:409,error:'Restore course sales before publishing new lessons'};
  if(!String(l.title||'').trim()||!validCents(l.price)||!validLessonMinutes(l.duration)||!youtubeVideoId(l.video_url)||!safePublicImageUrl(l.cover_url,safeExternalUrl))
   return {status:409,error:'Save valid lesson details, a YouTube video URL and a public cover before publication.'};
  db.prepare('UPDATE lessons SET published=1 WHERE id=? AND published=0').run(id);
  return {status:200,published:1,already_published:false,course_active:l.course_active};
 })();
 const {status,...body}=result;
 return res.status(status).json(body);
});
app.patch('/api/admin/lessons/:id',auth,admin,(req,res)=>{const l=db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);if(!l)return res.status(404).json({error:'Not found'});const url=cleanText(req.body.video_url??l.video_url,1000);if(url&&!youtubeVideoId(url))return res.status(400).json({error:'Use a valid YouTube video URL'});db.prepare('UPDATE lessons SET video_url=?,title=?,free=? WHERE id=?').run(url,cleanText(req.body.title??l.title,120),req.body.free===undefined?l.free:(req.body.free?1:0),l.id);res.json({ok:true})});
app.post('/api/admin/mentorships/:id/verify-payment',auth,admin,(req,res)=>{
 const result=verifyMentorshipManualPayment(db,req.params.id);
 if(result.ok){
  const recipient=db.prepare('SELECT u.email FROM mentorships m JOIN users u ON u.id=m.user_id WHERE m.id=?').get(req.params.id);
  if(recipient)mail.notify(recipient.email,'mentorship:verified:'+req.params.id,
   'Legwork · Your mentorship payment was confirmed',
   'The school verified payment for mentorship request #'+req.params.id+'. Your personal review is now awaiting the teacher.');
 }
 res.status(result.status).json(result.ok?{ok:true}:{error:result.error});
});
app.patch('/api/admin/mentorships/:id',auth,admin,(req,res)=>{if(mentorshipPaymentUnderReview(db,req.params.id))return res.status(409).json({error:'Payment refunded, voided, or under reconciliation; resolve before sending feedback'});const feedback=cleanText(req.body.feedback,8000);if(!feedback)return res.status(400).json({error:'Feedback required'});const r=db.prepare("UPDATE mentorships SET feedback=?,status='answered' WHERE id=? AND status IN ('paid','answered')").run(feedback,req.params.id);if(r.changes){const buyer=db.prepare('SELECT u.email FROM mentorships m JOIN users u ON u.id=m.user_id WHERE m.id=?').get(req.params.id);if(buyer)mail.notify(buyer.email,'mentorship:feedback:'+req.params.id+':'+crypto.createHash('sha256').update(feedback).digest('hex'),'Legwork · Your mentorship feedback is ready','Your mentor has reviewed your video. Sign in to Legwork to see the feedback.')}res.status(r.changes?200:409).json(r.changes?{ok:true}:{error:'Verify payment first'})});
registerExtraRoutes(app,db,{auth,admin,current,cleanText,hashPassword,verifyPassword,safeExternalUrl,safePublicImageUrl,youtubeVideoId,mail});
registerRequestRoutes(app,db,{auth});
registerMarketingRoutes(app,db,{auth,admin,mail});
registerSiteMediaRoutes(app,db,{auth,admin,safeExternalUrl,safePublicImageUrl});
registerImageUploads(app,db,{auth,admin,dbPath});
registerCertificateRoutes(app,db,{auth,admin,mail});
registerEditorialRoutes(app,db,{auth,admin});
registerLearningRoutes(app,db,{auth});
registerPrivateLearningRoutes(app,db,{auth,admin,mail});
registerBundleRoutes(app,db,{auth,admin,cleanText,mail});
registerPaymentRoutes(app,db,{auth,admin,mail});
registerAccountDataRoutes(app,db,{auth,admin,verifyPassword,mail});
registerOperationsRoutes(app,db,{auth,admin,mail});
 // Match common catalog and private account query patterns without changing data.
 db.exec([
  'CREATE INDEX IF NOT EXISTS lessons_course_public_order_idx ON lessons(course_id,published,sort_order,id)',
  'CREATE INDEX IF NOT EXISTS orders_user_history_idx ON orders(user_id,id DESC)',
  'CREATE INDEX IF NOT EXISTS orders_item_status_idx ON orders(kind,item_id,status)',
  'CREATE INDEX IF NOT EXISTS orders_user_item_pending_idx ON orders(user_id,kind,item_id,status,plan)',
  'CREATE INDEX IF NOT EXISTS payment_attempts_user_history_idx ON payment_attempts(user_id,id DESC)',
  'CREATE INDEX IF NOT EXISTS payment_attempt_orders_order_idx ON payment_attempt_orders(order_id,attempt_id)'
 ].join(';')+';');
app.get('/api/admin/backup',auth,admin,(req,res)=>res.set('Cache-Control','private, no-store').json({supported:false,reason:'Portable Cloudflare export is available only inside the live SQLite Durable Object.'}));
app.get('/api/admin/recovery',auth,admin,(req,res)=>res.set('Cache-Control','private, no-store').json({supported:false,kind:'node-sqlite',window_days:0,restore_available_in_ui:false,checkpoints:[]}));
app.use('/api',(req,res)=>res.status(404).json({error:'API route not found'}));
// Public metadata is derived only from published catalog and editorial copy.
app.get('/api/public-seo',(req,res)=>{
 const route=req.query.path;
 if(typeof route!=='string'||route.length>120)return res.status(400).json({error:'Invalid public path'});
 const model=publicSeoModel(db,route);
 if(!model)return res.status(404).json({error:'Public page not found'});
 res.json(model);
});
// Public, crawlable paths are deliberately limited to editorial landing pages.
const htmlTemplatePath=path.resolve('public/index.html');
const productionHtmlTemplate=prod?fs.readFileSync(htmlTemplatePath,'utf8'):null;
const currentHtmlTemplate=()=>prod?productionHtmlTemplate:fs.readFileSync(htmlTemplatePath,'utf8');
const indexForRequest=req=>seoIndexAllowed({enabled:indexingEnabled,stage:process.env.DEPLOYMENT_STAGE||'production',origin:siteOrigin,requestOrigin:req.protocol+'://'+req.get('host')});
app.get('/robots.txt',(req,res)=>res.type('text/plain').set('Cache-Control','no-store').send(robotsText(siteOrigin,indexForRequest(req))));
app.get('/sitemap.xml',(req,res)=>{
 if(!indexForRequest(req))return res.status(404).type('text/plain').set('Cache-Control','no-store').send('Not available before publication');
 res.type('application/xml').set('Cache-Control','public, max-age=300').send(sitemapXml(siteOrigin,publicSeoModel(db,'sitemap').paths));
});
app.get('/health',(req,res)=>{
 try{db.prepare('SELECT 1 AS ready').get();res.set('Cache-Control','no-store').json({ok:true})}
 catch{res.status(503).json({ok:false})}
});
app.use(express.static('public',{extensions:['html'],index:false,setHeaders:(res,file)=>{
 if(file.endsWith('.html')){res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow')}
 else if(/\.(?:js|css)$/.test(file))res.setHeader('Cache-Control',prod?'public, max-age=300':'no-store');
}}));
app.get(['/', '/courses','/course','/course/:slug','/shop','/mentorship','/es','/es/course','/es/mentorship'],(req,res)=>{
 const model=publicSeoModel(db,req.path);
 if(!model)return res.status(404).set('X-Robots-Tag','noindex, nofollow').type('text/plain').send('Page not found');
 if(req.path!==model.path)return res.redirect(301,model.path);
 const indexAllowed=indexForRequest(req);
 res.type('html').set('Cache-Control','no-store').set('X-Robots-Tag',indexAllowed?'index, follow':'noindex, nofollow').send(renderPublicSeo(currentHtmlTemplate(),model,siteOrigin||'http://localhost:3000',indexAllowed));
});
app.get('*',(req,res)=>res.status(404).set('X-Robots-Tag','noindex, nofollow').type('text/plain').send('Page not found'));
app.use((err,req,res,next)=>{if(res.headersSent)return next(err);if(err.type==='entity.too.large')return res.status(413).json({error:'Request body too large'});if(err.type==='entity.parse.failed')return res.status(400).json({error:'Invalid request body'});console.error('API error:',err.code||err.name||'unknown');res.status(500).json({error:'Internal server error'})});
const server=app.listen(port,()=>console.log('Legwork listening on '+port));
function shutdown(signal){
 console.log('Shutting down Legwork after '+signal);
 server.close(()=>{try{db.pragma('wal_checkpoint(TRUNCATE)')}catch{}db.close();process.exit(0)});
 setTimeout(()=>process.exit(1),10000).unref();
}
process.once('SIGTERM',()=>shutdown('SIGTERM'));
process.once('SIGINT',()=>shutdown('SIGINT'));