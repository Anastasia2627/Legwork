import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {hashPassword,verifyPassword,newToken,tokenHash,cleanText,safeExternalUrl} from './lib/security.js';
import {registerExtraRoutes} from './lib/features.js';
import {registerLearningRoutes} from './lib/learning.js';
import {registerBundleRoutes} from './lib/bundles.js';
import {initPayments,registerPaymentWebhook,registerPaymentRoutes} from './lib/payments.js';
import {createMailService} from './lib/mailing.js';
import {registerCertificateRoutes} from './lib/certificates.js';
import {registerEditorialRoutes} from './lib/editorial.js';
import {EDITORIAL_DEFAULTS} from './lib/editorial.js';
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
'CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,course_id INTEGER NOT NULL REFERENCES courses(id),title TEXT NOT NULL,category TEXT DEFAULT "Legwork",kind TEXT DEFAULT "Element",level TEXT DEFAULT "Beginner",duration INTEGER DEFAULT 12,price INTEGER DEFAULT 1500,video_url TEXT,free INTEGER DEFAULT 0,sort_order INTEGER DEFAULT 0)',
'CREATE TABLE IF NOT EXISTS enrollments(user_id INTEGER REFERENCES users(id),course_id INTEGER REFERENCES courses(id),PRIMARY KEY(user_id,course_id))',
'CREATE TABLE IF NOT EXISTS lesson_access(user_id INTEGER REFERENCES users(id),lesson_id INTEGER REFERENCES lessons(id),PRIMARY KEY(user_id,lesson_id))',
'CREATE TABLE IF NOT EXISTS progress(user_id INTEGER REFERENCES users(id),lesson_id INTEGER REFERENCES lessons(id),completed INTEGER DEFAULT 0,homework_url TEXT,PRIMARY KEY(user_id,lesson_id))',
'CREATE TABLE IF NOT EXISTS mentorships(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),package TEXT NOT NULL,video_url TEXT NOT NULL,experience TEXT DEFAULT "",goals TEXT DEFAULT "",status TEXT DEFAULT "awaiting_payment",feedback TEXT DEFAULT "",created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
'CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),kind TEXT NOT NULL,item_id INTEGER,amount INTEGER NOT NULL,status TEXT DEFAULT "pending",created_at TEXT DEFAULT CURRENT_TIMESTAMP)'
];for(const sql of schema)db.exec(sql);
db.prepare('INSERT OR IGNORE INTO courses(slug,title,description,price) VALUES(?,?,?,?)').run('legwork-lab','Legwork Lab','Improve your legwork without exhausting stretching.',16000);
const c=db.prepare('SELECT id FROM courses WHERE slug=?').get('legwork-lab');if(!db.prepare('SELECT COUNT(*) n FROM lessons').get().n){const add=db.prepare('INSERT INTO lessons(course_id,title,category,kind,level,duration,price,free,sort_order) VALUES(?,?,?,?,?,?,?,?,?)');['Prestart · The basics','Warm-up for ankles','Flexi Legs foundation','Point your feet','Knee Circle','Leg Wave','Hip mobility','Floorwork fundamentals','Beautiful transitions','Knee balance','Extended lines','Power and control','Advanced leg circles','Wave combinations','Floor flow','Musicality','Choreography practice','Signature movement','Final routine','Recovery','Technique notes','Practice checklist','Final challenge'].forEach((name,i)=>add.run(c.id,name,i<4?'Warm-up':i<14?'Legwork':'Floor work',i<4?'Warm-up':'Element',i<7?'Beginner':i<17?'Intermediate':'Advanced',10+i%8,1500,i===0?1:0,i+1))}
initPayments(db);
const secret=process.env.ADMIN_PASSWORD;if(secret&&secret.length>=12&&!secret.startsWith('REPLACE_')&&!db.prepare("SELECT 1 FROM users WHERE role='admin'").get())db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run('admin@legwork.local','Admin',hashPassword(secret),'admin');else if(!secret)console.warn('Set ADMIN_PASSWORD in environment to create admin');
if(prod&&!process.env.SITE_ORIGIN)throw Error('SITE_ORIGIN must be set to the HTTPS public origin in production');
if(prod&&(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32||process.env.SESSION_SECRET.startsWith('REPLACE_')))throw Error('Set a unique SESSION_SECRET of at least 32 characters for production');
app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["\u0027self\u0027","https://fonts.googleapis.com"],fontSrc:["\u0027self\u0027","https://fonts.gstatic.com"],styleSrcAttr:["\u0027unsafe-inline\u0027"],imgSrc:["'self'","data:","https:"],frameSrc:["'self'","https://www.youtube-nocookie.com"],formAction:["'self'","https://secure.wayforpay.com"],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:prod?[]:null}}}));app.use(express.json({limit:'100kb'}));
const jsonRateLimit=(limit,windowMs)=>rateLimit({windowMs,limit,standardHeaders:'draft-7',legacyHeaders:false,handler:(req,res)=>res.status(429).json({error:'Too many requests. Please try again in a moment.'})});
app.use('/api/auth',jsonRateLimit(30,15*60*1000));
const apiReadLimiter=jsonRateLimit(1200,60*1000),apiWriteLimiter=jsonRateLimit(180,60*1000);
app.use('/api',(req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?apiReadLimiter(req,res,next):apiWriteLimiter(req,res,next));
registerPaymentWebhook(app,db,()=>mail);
app.use('/api',(req,res,next)=>{
 if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
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
const cookie=t=>'legwork_session='+t+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+(prod?'; Secure':'');
const current=req=>{const token=/\blegwork_session=([a-f0-9]{64})\b/.exec(req.headers.cookie||'')?.[1];return token?db.prepare('SELECT u.id,u.email,u.name,u.instagram,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(tokenHash(token),Date.now()):null};
const auth=(req,res,next)=>{req.user=current(req);return req.user?next():res.status(401).json({error:'Please log in'})};const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Forbidden'});
const mail=createMailService(app,db,{auth,hashPassword,cleanText});
if(prod&&!mail.enabled)console.warn('Email delivery unavailable: public registration disabled until SMTP is configured');
const login=(u,res)=>{const token=newToken();db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),u.id,Date.now()+604800000);res.setHeader('Set-Cookie',cookie(token));res.json({user:{id:u.id,name:u.name,email:u.email,role:u.role}})};
app.get('/api/me',(req,res)=>res.json({user:current(req)}));
app.post('/api/auth/register',(req,res)=>{if(prod&&!mail.enabled)return res.status(503).json({error:'Registration requires email delivery configuration'});const name=cleanText(req.body.name,80),email=cleanText(req.body.email,254).toLowerCase(),password=req.body.password;if(!name||!/^.+@.+\..+$/.test(email)||typeof password!=='string'||password.length<12||password.length>128)return res.status(400).json({error:'Name, valid email and 12–128 character password required'});try{const r=db.prepare('INSERT INTO users(email,name,password_hash) VALUES(?,?,?)').run(email,name,hashPassword(password));mail.signup({id:Number(r.lastInsertRowid),email,name,role:'student'});login({id:r.lastInsertRowid,email,name,role:'student'},res)}catch{res.status(409).json({error:'Email already registered'})}});
app.post('/api/auth/login',(req,res)=>{const id=cleanText(req.body.email,254).toLowerCase(),p=req.body.password;const u=id==='admin'?db.prepare("SELECT * FROM users WHERE role='admin'").get():db.prepare('SELECT * FROM users WHERE email=?').get(id);return typeof p==='string'&&u&&verifyPassword(p,u.password_hash)?login(u,res):res.status(401).json({error:'Invalid credentials'})});
app.post('/api/auth/logout',(req,res)=>{const token=/\blegwork_session=([a-f0-9]{64})\b/.exec(req.headers.cookie||'')?.[1];if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));res.setHeader('Set-Cookie',cookie('')+'; Max-Age=0');res.json({ok:true})});
app.get('/api/courses',(req,res)=>res.json({courses:db.prepare('SELECT id,slug,title,description,price,guru_price FROM courses WHERE active=1').all()}));
app.get('/api/lessons',(req,res)=>res.json({lessons:db.prepare('SELECT l.id,l.course_id,l.title,l.category,l.kind,l.level,l.duration,l.price,l.free,l.sort_order,l.tags,l.equipment,l.focus,l.teacher,c.slug FROM lessons l JOIN courses c ON c.id=l.course_id WHERE c.active=1 ORDER BY l.sort_order').all()}));
const access=(u,l)=>l.free||u&&(u.role==='admin'||db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?').get(u.id,l.course_id)||db.prepare('SELECT 1 FROM lesson_access WHERE user_id=? AND lesson_id=?').get(u.id,l.id));
app.get('/api/lessons/:id/watch',(req,res)=>{const l=db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);if(!l)return res.status(404).json({error:'Not found'});const viewer=current(req);if(!viewer)return res.status(401).json({error:'Log in to watch lessons'});if(!access(viewer,l))return res.status(403).json({error:'Purchase required'});res.setHeader('Cache-Control','private, no-store');res.json({title:l.title,video_url:l.video_url})});
app.get('/api/dashboard',auth,(req,res)=>{const id=req.user.id;res.json({enrollments:db.prepare('SELECT c.*,e.tier FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=?').all(id),lessonAccess:db.prepare('SELECT lesson_id FROM lesson_access WHERE user_id=?').all(id).map(x=>x.lesson_id),progress:db.prepare('SELECT * FROM progress WHERE user_id=?').all(id),mentorships:db.prepare('SELECT * FROM mentorships WHERE user_id=? ORDER BY id DESC').all(id),orders:db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(id)})});
app.post('/api/progress/:id',auth,(req,res)=>{const l=db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);if(!l||!access(req.user,l))return res.status(403).json({error:'Forbidden'});const url=cleanText(req.body.homework_url,1000);if(url&&!safeExternalUrl(url))return res.status(400).json({error:'Invalid URL'});db.transaction(()=>{const existing=db.prepare('SELECT completed,homework_url FROM progress WHERE user_id=? AND lesson_id=?').get(req.user.id,l.id);const completed=req.body.completed===true?1:0;db.prepare('INSERT INTO progress(user_id,lesson_id,completed,homework_url) VALUES(?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET completed=excluded.completed,homework_url=excluded.homework_url').run(req.user.id,l.id,completed,url);if(!existing||completed!==1||String(existing.homework_url||'')!==String(url||'')){db.prepare('UPDATE homework_reviews SET approved=0,approved_at=NULL,approved_by=NULL WHERE user_id=? AND lesson_id=?').run(req.user.id,l.id)}})();res.json({ok:true})});
app.post('/api/orders',auth,mail.requireVerified,(req,res)=>{const kind=req.body.kind,id=Number(req.body.item_id),plan=req.body.plan==='guru'?'guru':'self';if(!['course','lesson'].includes(kind)||!Number.isInteger(id)||id<1)return res.status(400).json({error:'Invalid item'});if(kind==='lesson'&&req.body.plan==='guru')return res.status(400).json({error:'Plan not valid for this item'});const item=kind==='course'?db.prepare('SELECT price,guru_price FROM courses WHERE id=? AND active=1').get(id):db.prepare('SELECT price FROM lessons WHERE id=?').get(id);if(!item)return res.status(404).json({error:'Not found'});const already=kind==='course'?db.prepare('SELECT tier FROM enrollments WHERE user_id=? AND course_id=?').get(req.user.id,id):db.prepare('SELECT 1 FROM lesson_access WHERE user_id=? AND lesson_id=?').get(req.user.id,id);
if(already&&(kind==='lesson'||already.tier==='guru'||plan==='self'))return res.status(409).json({error:'You already have access to this content'});
const amount=kind==='course'&&plan==='guru'?item.guru_price:item.price;if(!Number.isSafeInteger(amount)||amount<0)return res.status(500).json({error:'Invalid product price'});const existing=db.prepare("SELECT id FROM orders WHERE user_id=? AND kind=? AND item_id=? AND plan=? AND status='pending'").get(req.user.id,kind,id,plan);if(existing)return res.status(409).json({error:'This item already has a pending request'});const r=db.prepare('INSERT INTO orders(user_id,kind,item_id,amount,plan) VALUES(?,?,?,?,?)').run(req.user.id,kind,id,amount,plan);res.status(201).json({id:r.lastInsertRowid,status:'pending',amount,message:'Request saved. No payment has been taken. Access only after verified payment and admin approval.'})});
app.post('/api/mentorships',auth,mail.requireVerified,(req,res)=>{const pack=req.body.package,url=cleanText(req.body.video_url,1000);if(!['Basic','Deep'].includes(pack)||!safeExternalUrl(url))return res.status(400).json({error:'Select Basic/Deep and provide video link'});const r=db.prepare('INSERT INTO mentorships(user_id,package,video_url,experience,goals,instagram,training_frequency,teaching) VALUES(?,?,?,?,?,?,?,?)').run(req.user.id,pack,url,pack==='Deep'?cleanText(req.body.experience,500):'',cleanText(req.body.goals,1500),cleanText(req.body.instagram,80),pack==='Deep'?cleanText(req.body.training_frequency,100):'',pack==='Deep'?cleanText(req.body.teaching,100):'');res.status(201).json({id:r.lastInsertRowid,message:'Awaiting manual payment confirmation'})});
app.patch('/api/profile',auth,(req,res)=>{const name=cleanText(req.body.name,80);if(!name)return res.status(400).json({error:'Name required'});db.prepare('UPDATE users SET name=?,instagram=? WHERE id=?').run(name,cleanText(req.body.instagram,80),req.user.id);res.json({ok:true})});
app.get('/api/admin/overview',auth,admin,(req,res)=>res.json({users:db.prepare('SELECT id,email,name,role FROM users ORDER BY id DESC LIMIT 100').all(),orders:db.prepare('SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 100').all(),mentorships:db.prepare('SELECT m.*,u.email FROM mentorships m JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 100').all(),courses:db.prepare('SELECT * FROM courses').all(),lessons:db.prepare('SELECT * FROM lessons ORDER BY course_id,sort_order,id').all()}));
app.post('/api/admin/enroll',auth,admin,(req,res)=>{const u=Number(req.body.user_id),c=Number(req.body.course_id);if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(u)||!db.prepare('SELECT 1 FROM courses WHERE id=?').get(c))return res.status(404).json({error:'Not found'});db.prepare('INSERT OR IGNORE INTO enrollments(user_id,course_id,tier) VALUES(?,?,?)').run(u,c,req.body.tier==='guru'?'guru':'self');res.json({ok:true})});
app.post('/api/admin/orders/:id/approve',auth,admin,(req,res)=>{const o=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);if(!o||o.status!=='pending')return res.status(409).json({error:'Not pending'});db.transaction(()=>{if(o.kind==='course'){db.prepare('INSERT INTO enrollments(user_id,course_id,tier) VALUES(?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET tier=CASE WHEN excluded.tier=\'guru\' THEN \'guru\' ELSE enrollments.tier END').run(o.user_id,o.item_id,o.plan==='guru'?'guru':'self')}else if(o.kind==='bundle'){const components=db.prepare('SELECT lesson_id FROM bundle_lessons WHERE bundle_id=?').all(o.item_id);if(!components.length)throw Error('Bundle has no lessons');for(const lesson of components)db.prepare('INSERT OR IGNORE INTO lesson_access(user_id,lesson_id) VALUES(?,?)').run(o.user_id,lesson.lesson_id)}else if(o.kind==='lesson'){db.prepare('INSERT OR IGNORE INTO lesson_access(user_id,lesson_id) VALUES(?,?)').run(o.user_id,o.item_id)}else throw Error('Unknown order type');db.prepare("UPDATE orders SET status='approved' WHERE id=?").run(o.id)})();const buyer=db.prepare('SELECT email FROM users WHERE id=?').get(o.user_id);if(buyer)mail.notify(buyer.email,'order:approved:'+o.id,'Legwork · Your course access is ready','Your order #'+o.id+' is approved. Open your Legwork student account to start learning.');res.json({ok:true})});
app.post('/api/admin/courses',auth,admin,(req,res)=>{const title=cleanText(req.body.title,120),slug=cleanText(req.body.slug,80).toLowerCase();if(!title||!/^[a-z0-9-]+$/.test(slug))return res.status(400).json({error:'Title and slug required'});try{const r=db.prepare('INSERT INTO courses(slug,title,description,price) VALUES(?,?,?,?)').run(slug,title,cleanText(req.body.description,1000),Math.max(0,Number(req.body.price)||0));res.status(201).json({id:r.lastInsertRowid})}catch{res.status(409).json({error:'Slug taken'})}});
app.post('/api/admin/lessons',auth,admin,(req,res)=>{const title=cleanText(req.body.title,120),url=cleanText(req.body.video_url,1000),course=Number(req.body.course_id);if(!title||(url&&!safeExternalUrl(url))||!db.prepare('SELECT 1 FROM courses WHERE id=?').get(course))return res.status(400).json({error:'Invalid lesson'});const r=db.prepare('INSERT INTO lessons(course_id,title,category,kind,level,duration,price,video_url,free,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)').run(course,title,cleanText(req.body.category,50)||'Legwork',cleanText(req.body.kind,40)||'Element',cleanText(req.body.level,40)||'Beginner',Number(req.body.duration)||12,Math.max(0,Number(req.body.price)||0),url,req.body.free?1:0,Number(req.body.sort_order)||100);res.status(201).json({id:r.lastInsertRowid})});
app.patch('/api/admin/lessons/:id',auth,admin,(req,res)=>{const l=db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);if(!l)return res.status(404).json({error:'Not found'});const url=cleanText(req.body.video_url??l.video_url,1000);if(url&&!safeExternalUrl(url))return res.status(400).json({error:'Invalid URL'});db.prepare('UPDATE lessons SET video_url=?,title=?,free=? WHERE id=?').run(url,cleanText(req.body.title??l.title,120),req.body.free===undefined?l.free:(req.body.free?1:0),l.id);res.json({ok:true})});
app.post('/api/admin/mentorships/:id/verify-payment',auth,admin,(req,res)=>{const r=db.prepare("UPDATE mentorships SET status='paid' WHERE id=? AND status='awaiting_payment'").run(req.params.id);res.status(r.changes?200:409).json(r.changes?{ok:true}:{error:'Not pending'})});
app.patch('/api/admin/mentorships/:id',auth,admin,(req,res)=>{const feedback=cleanText(req.body.feedback,8000);if(!feedback)return res.status(400).json({error:'Feedback required'});const r=db.prepare("UPDATE mentorships SET feedback=?,status='answered' WHERE id=? AND status IN ('paid','answered')").run(feedback,req.params.id);if(r.changes){const buyer=db.prepare('SELECT u.email FROM mentorships m JOIN users u ON u.id=m.user_id WHERE m.id=?').get(req.params.id);if(buyer)mail.notify(buyer.email,'mentorship:feedback:'+req.params.id+':'+crypto.createHash('sha256').update(feedback).digest('hex'),'Legwork · Your mentorship feedback is ready','Your mentor has reviewed your video. Sign in to Legwork to see the feedback.')}res.status(r.changes?200:409).json(r.changes?{ok:true}:{error:'Verify payment first'})});
registerExtraRoutes(app,db,{auth,admin,current,cleanText,hashPassword,verifyPassword,safeExternalUrl,mail});
registerCertificateRoutes(app,db,{auth,admin,mail});
registerEditorialRoutes(app,db,{auth,admin});
registerLearningRoutes(app,db,{auth});
registerBundleRoutes(app,db,{auth,admin,cleanText,mail});
registerPaymentRoutes(app,db,{auth,admin,mail});
app.use('/api',(req,res)=>res.status(404).json({error:'API route not found'}));
// Public, crawlable paths are deliberately limited to editorial landing pages.
// Never expose payments, classroom, certificates or admin URLs to a sitemap.
const htmlTemplate=fs.readFileSync(path.resolve('public/index.html'),'utf8');
const seoRoutes={
 '/':{page:'home',title:'Svitlana Yurchak | Online Dance School',description:'Explore exotic pole dance classes, Legwork Lab and personal dance mentorship.'},
 '/course':{page:'course',title:'Legwork Lab | Online Dance Course',description:'Learn the Legwork Lab technique through a structured online course.'},
 '/shop':{page:'shop',title:'Online Dance Classes & Bundles | Legwork',description:'Browse individual pole dance technique classes and lesson bundles.'},
 '/mentorship':{page:'mentorship',title:'Dance Video Mentorship | Legwork',description:'Receive personal dance video feedback and technique guidance.'}
};
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
const seoCopy=(route)=>{
 const entry=seoRoutes[route];if(!entry)return null;
 if(!['home','course','mentorship'].includes(entry.page))return entry;
 try{
  const stored=db.prepare('SELECT content_json FROM editorial_content WHERE page=? AND lang=?').get(entry.page,'en');
  const parsed=stored?JSON.parse(stored.content_json):{};
  const defaults=EDITORIAL_DEFAULTS[entry.page].en;
  return {...entry,title:String(parsed.metaTitle||defaults.metaTitle).slice(0,100),description:String(parsed.metaDescription||defaults.metaDescription).slice(0,170),heading:String(parsed.headline||[parsed.headlineTop||defaults.headlineTop,parsed.headlineAccent||defaults.headlineAccent].join(' ')).slice(0,170),intro:String(parsed.intro||defaults.intro).slice(0,380)};
 }catch{return entry}
};
app.get('/robots.txt',(req,res)=>{
 res.type('text/plain').set('Cache-Control','no-store');
 res.send(indexingEnabled?'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: '+siteOrigin+'/sitemap.xml\n':'User-agent: *\nDisallow: /\n');
});
app.get('/sitemap.xml',(req,res)=>{
 if(!indexingEnabled)return res.status(404).type('text/plain').send('Not available before publication');
 res.type('application/xml').set('Cache-Control','public, max-age=3600');
 const urls=Object.keys(seoRoutes).map(route=>'<url><loc>'+escapeHtml(siteOrigin+route)+'</loc></url>').join('');
 res.send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls+'</urlset>');
});
app.get('/health',(req,res)=>{
 try{db.prepare('SELECT 1 AS ready').get();res.set('Cache-Control','no-store').json({ok:true})}
 catch{res.status(503).json({ok:false})}
});
app.use(express.static('public',{extensions:['html'],index:false,setHeaders:(res,file)=>{
 if(file.endsWith('.html')){res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow')}
 else if(/\.(?:js|css)$/.test(file))res.setHeader('Cache-Control','public, max-age=300');
}}));
app.get(['/', '/course', '/shop', '/mentorship'],(req,res)=>{
 const info=seoCopy(req.path),canonical=(siteOrigin||'http://localhost:3000')+req.path;
 const title=escapeHtml(info.title),desc=escapeHtml(info.description);
 const indexAllowed=indexingEnabled;
 const heading=escapeHtml(info.heading||info.title),intro=escapeHtml(info.intro||info.description);
 const tags=[
 '<meta name="robots" content="'+(indexAllowed?'index,follow':'noindex,nofollow')+'" data-index-enabled="'+String(indexAllowed)+'">',
 '<link rel="canonical" href="'+escapeHtml(canonical)+'">',
 '<meta property="og:type" content="website">',
 '<meta property="og:title" content="'+title+'">',
 '<meta property="og:description" content="'+desc+'">',
 '<meta property="og:url" content="'+escapeHtml(canonical)+'">',
 '<meta name="twitter:card" content="summary">'
 ].join('');
 const html=htmlTemplate.replace(/<title>[^<]*<\/title>/,'<title>'+title+'</title>')
  .replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="'+desc+'">')
  .replace('</head>',tags+'</head>')
  .replace('<div class="loading">Preparing your experience…</div>','<section class="seo-fallback"><h1>'+heading+'</h1><p>'+intro+'</p></section>');
 res.type('html').set('Cache-Control','no-store').set('X-Robots-Tag',indexAllowed?'index, follow':'noindex, nofollow').send(html);
});
app.get('*',(req,res)=>res.status(404).set('X-Robots-Tag','noindex, nofollow').type('text/plain').send('Page not found'));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Internal server error'})});
const server=app.listen(port,()=>console.log('Legwork listening on '+port));
function shutdown(signal){
 console.log('Shutting down Legwork after '+signal);
 server.close(()=>{try{db.pragma('wal_checkpoint(TRUNCATE)')}catch{}db.close();process.exit(0)});
 setTimeout(()=>process.exit(1),10000).unref();
}
process.once('SIGTERM',()=>shutdown('SIGTERM'));
process.once('SIGINT',()=>shutdown('SIGINT'));