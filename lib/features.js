import crypto from 'node:crypto';
/**
 * Additive, idempotent migrations and privileged school workflows.
 * Every ownership and tier check is performed on the server.
 */
export function registerExtraRoutes(app,db,{auth,admin,cleanText,hashPassword,verifyPassword,safeExternalUrl,safePublicImageUrl,youtubeVideoId,mail}){
const addColumn=(t,c,d)=>{if(!db.pragma('table_info('+t+')').some(x=>x.name===c))db.exec('ALTER TABLE '+t+' ADD COLUMN '+c+' '+d)};
addColumn('enrollments','tier',"TEXT NOT NULL DEFAULT 'self'");
addColumn('orders','plan',"TEXT NOT NULL DEFAULT 'self'");
addColumn('courses','guru_price','INTEGER NOT NULL DEFAULT 36000');
addColumn('mentorships','instagram',"TEXT NOT NULL DEFAULT ''");
addColumn('mentorships','training_frequency',"TEXT NOT NULL DEFAULT ''");
addColumn('mentorships','teaching',"TEXT NOT NULL DEFAULT ''");
addColumn('lessons','tags',"TEXT NOT NULL DEFAULT ''");
addColumn('lessons','teacher',"TEXT NOT NULL DEFAULT 'Svitlana Yurchak'");
addColumn('lessons','equipment',"TEXT NOT NULL DEFAULT 'Any support'");
addColumn('lessons','focus',"TEXT NOT NULL DEFAULT ''");
const statements=[
'CREATE TABLE IF NOT EXISTS homework_reviews(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,feedback TEXT NOT NULL,reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,lesson_id))',
'CREATE TABLE IF NOT EXISTS activity(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,day TEXT NOT NULL,PRIMARY KEY(user_id,day))',
"CREATE TABLE IF NOT EXISTS email_waitlist(email TEXT PRIMARY KEY,purpose TEXT NOT NULL CHECK (purpose IN ('free-lesson','book')),consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
'CREATE TABLE IF NOT EXISTS site_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)'
];for(const s of statements)db.exec(s);
const recordActivity=uid=>db.prepare('INSERT OR IGNORE INTO activity(user_id,day) VALUES(?,?)').run(uid,new Date().toISOString().slice(0,10));
const guru=(uid,course)=>!!db.prepare("SELECT 1 FROM enrollments WHERE user_id=? AND course_id=? AND tier='guru'").get(uid,course);
const validPrice=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0&&Number(n)<=100000000;
app.post('/api/orders/batch',auth,mail.requireVerified,(req,res)=>{
 const lessonIds=req.body?.lesson_ids??[],bundleIds=req.body?.bundle_ids??[];
 const valid=a=>Array.isArray(a)&&a.length<=30&&a.every(x=>Number.isSafeInteger(x)&&x>0)&&new Set(a).size===a.length;
 if(!valid(lessonIds)||!valid(bundleIds)||lessonIds.length+bundleIds.length<1||lessonIds.length+bundleIds.length>30)return res.status(400).json({error:'Choose 1–30 distinct lessons or bundles'});
 const getLesson=db.prepare('SELECT l.id,l.price,l.course_id,l.free FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=? AND c.active=1');
 const getBundle=db.prepare('SELECT id,price FROM bundles WHERE id=? AND active=1');
 const bundleLessonIds=db.prepare('SELECT lesson_id FROM bundle_lessons WHERE bundle_id=?');
 const courseAccess=db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?');
 const individualAccess=db.prepare('SELECT 1 FROM lesson_access WHERE user_id=? AND lesson_id=?');
 const pending=db.prepare("SELECT 1 FROM orders WHERE user_id=? AND kind=? AND item_id=? AND status='pending'");
 const create=db.prepare("INSERT INTO orders(user_id,kind,item_id,amount,plan) VALUES(?,?,?,?,'self')");
 try{
  const orders=db.transaction(()=>{
   const lessonRows=lessonIds.map(id=>getLesson.get(id));
   if(lessonRows.some((l,i)=>!l||l.free||!Number.isSafeInteger(l.price)||l.price<0||courseAccess.get(req.user.id,l.course_id)||individualAccess.get(req.user.id,lessonIds[i])||pending.get(req.user.id,'lesson',lessonIds[i])))throw Error('A selected lesson is unavailable, owned or pending');
   const bundleRows=bundleIds.map(id=>getBundle.get(id));
   if(bundleRows.some(b=>!b||!Number.isSafeInteger(b.price)||b.price<0))throw Error('A selected bundle is unavailable');
   const allSelectedLessons=new Set(lessonIds);
   for(const b of bundleRows){
    if(pending.get(req.user.id,'bundle',b.id))throw Error('Bundle request already pending');
    const bundleLessonRows=bundleLessonIds.all(b.id);
    if(bundleLessonRows.length<2)throw Error('Bundle must contain at least two lessons');
    let newlyAccessible=0;
    for(const entry of bundleLessonRows){
     if(allSelectedLessons.has(entry.lesson_id))throw Error('Shopping cart contains overlapping lesson packages');
     allSelectedLessons.add(entry.lesson_id);
     const lesson=getLesson.get(entry.lesson_id);
     if(!lesson)throw Error('Bundle includes unavailable lessons');
     if(!courseAccess.get(req.user.id,lesson.course_id)&&!individualAccess.get(req.user.id,lesson.id))newlyAccessible++;
    }
    if(newlyAccessible===0)throw Error('You already own all lessons in this bundle');
   }
   const rows=[...lessonRows.map(l=>({kind:'lesson',id:l.id,amount:l.price})),...bundleRows.map(b=>({kind:'bundle',id:b.id,amount:b.price}))];
   return rows.map(item=>({id:Number(create.run(req.user.id,item.kind,item.id,item.amount).lastInsertRowid),kind:item.kind,item_id:item.id,amount:item.amount}));
  })();
  res.status(201).json({orders,total:orders.reduce((sum,o)=>sum+o.amount,0),status:'pending',message:'Purchase requests saved together. No payment was taken.'});
 }catch(e){res.status(409).json({error:e.message})}
});
app.get('/api/account/achievements',auth,(req,res)=>{const uid=req.user.id;const ls=db.prepare('SELECT l.id,l.title,l.course_id,p.completed,p.homework_url FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=? WHERE l.free=1 OR EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id=? AND e.course_id=l.course_id) OR EXISTS (SELECT 1 FROM lesson_access a WHERE a.user_id=? AND a.lesson_id=l.id)').all(uid,uid,uid);const badges=ls.filter(l=>l.completed===1&&l.homework_url).map(l=>({lesson_id:l.id,title:l.title+' Boss'}));const days=new Set(db.prepare('SELECT day FROM activity WHERE user_id=?').all(uid).map(x=>x.day));let streak=0;const now=new Date();if(!days.has(now.toISOString().slice(0,10)))now.setUTCDate(now.getUTCDate()-1);while(days.has(now.toISOString().slice(0,10))){streak++;now.setUTCDate(now.getUTCDate()-1)}const certificates=db.prepare("SELECT c.id,c.title FROM courses c JOIN enrollments e ON e.course_id=c.id WHERE e.user_id=? AND e.tier='guru'").all(uid).map(c=>{const own=ls.filter(l=>l.course_id===c.id);return {course_id:c.id,title:c.title,submitted:own.length>0&&own.every(l=>l.completed===1&&!!l.homework_url),total:own.length,completed:own.filter(l=>l.completed===1&&l.homework_url).length}});res.json({streak,badges,certificates,completed:ls.filter(l=>l.completed===1).length,lessonCount:ls.length})});
app.post('/api/account/activity',auth,(req,res)=>{const id=Number(req.body.lesson_id),l=db.prepare('SELECT id,course_id,free FROM lessons WHERE id=?').get(id);if(!l)return res.status(404).json({error:'Lesson not found'});const owned=l.free||req.user.role==='admin'||db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?').get(req.user.id,l.course_id)||db.prepare('SELECT 1 FROM lesson_access WHERE user_id=? AND lesson_id=?').get(req.user.id,l.id);if(!owned)return res.status(403).json({error:'Forbidden'});recordActivity(req.user.id);res.json({ok:true})});
app.get('/api/account/homework-reviews',auth,(req,res)=>res.json({reviews:db.prepare('SELECT r.lesson_id,r.feedback,r.reviewed_at,l.title FROM homework_reviews r JOIN lessons l ON l.id=r.lesson_id WHERE r.user_id=?').all(req.user.id)}));
app.post('/api/account/change-password',auth,(req,res)=>{const old=req.body.current_password,next=req.body.new_password;if(typeof old!=='string'||typeof next!=='string'||next.length<12||next.length>128)return res.status(400).json({error:'Password must be 12–128 characters'});const u=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);if(!verifyPassword(old,u.password_hash))return res.status(403).json({error:'Current password is incorrect'});db.transaction(()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next),req.user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id)})();res.setHeader('Set-Cookie','legwork_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(process.env.NODE_ENV==='production'?'; Secure':''));res.json({ok:true,message:'Password changed. Please log in again.'})});
app.get('/api/admin/homework',auth,admin,(req,res)=>{
 const allowed=new Set(['all','pending','reviewed','approved']);
 const status=String(req.query.status||'all');
 const limit=Number(req.query.limit||30),offset=Number(req.query.offset||0);
 if(!allowed.has(status)||!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000)
  return res.status(400).json({error:'Invalid homework queue filters'});
 const source=" FROM progress p JOIN users u ON u.id=p.user_id "+
  "JOIN lessons l ON l.id=p.lesson_id JOIN courses c ON c.id=l.course_id "+
  "JOIN enrollments e ON e.user_id=p.user_id AND e.course_id=l.course_id AND e.tier='guru' "+
  "LEFT JOIN homework_reviews r ON r.user_id=p.user_id AND r.lesson_id=p.lesson_id "+
  "WHERE p.homework_url IS NOT NULL AND length(p.homework_url)>0";
 const condition=status==='pending'?' AND r.reviewed_at IS NULL':
  status==='reviewed'?' AND r.reviewed_at IS NOT NULL AND COALESCE(r.approved,0)=0':
  status==='approved'?' AND COALESCE(r.approved,0)=1':'';
 const count=Number(db.prepare('SELECT COUNT(*) n'+source+condition).get().n);
 const homework=db.prepare(
  "SELECT p.user_id,p.lesson_id,p.completed,p.homework_url,u.email,u.name,l.title AS lesson,c.title AS course,"+
  "COALESCE(r.approved,0) AS approved,r.feedback,r.reviewed_at,"+
  "CASE WHEN COALESCE(r.approved,0)=1 THEN 'approved' WHEN r.reviewed_at IS NOT NULL THEN 'reviewed' ELSE 'pending' END AS review_status"+
  source+condition+
  " ORDER BY CASE WHEN r.reviewed_at IS NULL THEN 0 WHEN COALESCE(r.approved,0)=0 THEN 1 ELSE 2 END,p.lesson_id DESC,p.user_id DESC LIMIT ? OFFSET ?"
 ).all(limit,offset);
 res.setHeader('Cache-Control','private, no-store');
 res.json({homework,count,status,limit,offset,has_more:offset+homework.length<count,
  totals:{all:Number(db.prepare('SELECT COUNT(*) n'+source).get().n),
   pending:Number(db.prepare('SELECT COUNT(*) n'+source+' AND r.reviewed_at IS NULL').get().n),
   reviewed:Number(db.prepare('SELECT COUNT(*) n'+source+' AND r.reviewed_at IS NOT NULL AND COALESCE(r.approved,0)=0').get().n),
   approved:Number(db.prepare('SELECT COUNT(*) n'+source+' AND COALESCE(r.approved,0)=1').get().n)}});
});
app.post('/api/admin/homework/:userId/:lessonId/review',auth,admin,(req,res)=>{const uid=Number(req.params.userId),lid=Number(req.params.lessonId),feedback=cleanText(req.body.feedback,8000),l=db.prepare('SELECT course_id FROM lessons WHERE id=?').get(lid),p=db.prepare('SELECT homework_url FROM progress WHERE user_id=? AND lesson_id=?').get(uid,lid);if(!feedback)return res.status(400).json({error:'Feedback required'});if(!l||!p?.homework_url||!guru(uid,l.course_id))return res.status(404).json({error:'Eligible homework not found'});db.prepare('INSERT INTO homework_reviews(user_id,lesson_id,feedback) VALUES(?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET feedback=excluded.feedback,reviewed_at=CURRENT_TIMESTAMP,approved=0,approved_at=NULL,approved_by=NULL').run(uid,lid,feedback);const student=db.prepare('SELECT email FROM users WHERE id=?').get(uid);if(student)mail.notify(student.email,'homework:feedback:'+uid+':'+lid+':'+crypto.createHash('sha256').update(feedback).digest('hex'),'Legwork · Your homework was reviewed','Your teacher reviewed the homework for this lesson. Sign in to your Legwork account to read the feedback.');res.json({ok:true,message:'Feedback saved in student account.'})});
app.patch('/api/admin/courses/:id',auth,admin,(req,res)=>{const c=db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);if(!c)return res.status(404).json({error:'Course not found'});const title=cleanText(req.body.title??c.title,120),slug=cleanText(req.body.slug??c.slug,80).toLowerCase(),desc=cleanText(req.body.description??c.description,2500),price=req.body.price===undefined?c.price:Number(req.body.price),guruPrice=req.body.guru_price===undefined?c.guru_price:Number(req.body.guru_price);if(!title||!/^[a-z0-9-]{2,80}$/.test(slug)||!validPrice(price)||!validPrice(guruPrice))return res.status(400).json({error:'Invalid course'});try{db.prepare('UPDATE courses SET title=?,slug=?,description=?,price=?,guru_price=? WHERE id=?').run(title,slug,desc,price,guruPrice,c.id);res.json({ok:true})}catch{res.status(409).json({error:'Slug already exists'})}});
app.patch('/api/admin/lessons/:id/full',auth,admin,(req,res)=>{const l=db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);if(!l)return res.status(404).json({error:'Lesson not found'});const title=cleanText(req.body.title??l.title,120),category=cleanText(req.body.category??l.category,50),kind=cleanText(req.body.kind??l.kind,50),level=cleanText(req.body.level??l.level,50),price=req.body.price===undefined?l.price:Number(req.body.price),duration=req.body.duration===undefined?l.duration:Number(req.body.duration),sortOrder=req.body.sort_order===undefined?l.sort_order:Number(req.body.sort_order),url=cleanText(req.body.video_url??l.video_url,1200),tags=cleanText(req.body.tags??l.tags,280),teacher=cleanText(req.body.teacher??l.teacher,100),equipment=cleanText(req.body.equipment??l.equipment,50),focus=cleanText(req.body.focus??l.focus,80),cover=cleanText(req.body.cover_url??l.cover_url,1000);if(!title||!category||!kind||!level||!validPrice(price)||!Number.isInteger(duration)||duration<1||duration>600||!Number.isSafeInteger(sortOrder)||sortOrder<0||sortOrder>1000000||(req.body.sort_order!==undefined&&(req.body.sort_order===null||req.body.sort_order===''))||(url&&!youtubeVideoId(url))||(cover&&!safePublicImageUrl(cover,safeExternalUrl)))return res.status(400).json({error:'Invalid lesson'});db.prepare('UPDATE lessons SET title=?,category=?,kind=?,level=?,price=?,duration=?,sort_order=?,video_url=?,free=?,tags=?,teacher=?,equipment=?,focus=?,cover_url=? WHERE id=?').run(title,category,kind,level,price,duration,sortOrder,url,req.body.free===undefined?l.free:(req.body.free===true?1:0),tags,teacher,equipment,focus,cover,l.id);res.json({ok:true})});
/**
 * Move exactly one lesson within its current course. Server computes the
 * target order; the client cannot reorder another course or write SQL ranks.
 * Normalize identical legacy sort keys deterministically inside a transaction.
 */
app.post('/api/admin/lessons/:id/reorder',auth,admin,(req,res)=>{
 const id=Number(req.params.id),direction=req.body?.direction;
 if(!Number.isSafeInteger(id)||id<1||!['up','down'].includes(direction))
  return res.status(400).json({error:'Choose a lesson and up/down direction'});
 const lesson=db.prepare('SELECT id,course_id FROM lessons WHERE id=?').get(id);
 if(!lesson)return res.status(404).json({error:'Lesson not found'});
 const courseLessons=db.prepare('SELECT id FROM lessons WHERE course_id=? ORDER BY sort_order,id').all(lesson.course_id);
 const from=courseLessons.findIndex(row=>row.id===id);
 const to=from+(direction==='up'?-1:1);
 if(from<0||to<0||to>=courseLessons.length)
  return res.json({ok:true,moved:false,course_id:lesson.course_id});
 if(courseLessons.length>10000)
  return res.status(409).json({error:'The course has too many lessons for one operation'});
 const ordered=courseLessons.map(row=>row.id);
 [ordered[from],ordered[to]]=[ordered[to],ordered[from]];
 const apply=db.transaction(()=>{
  const statement=db.prepare('UPDATE lessons SET sort_order=? WHERE id=? AND course_id=?');
  ordered.forEach((lessonId,index)=>statement.run(index+1,lessonId,lesson.course_id));
 });
 apply();
 res.setHeader('Cache-Control','private, no-store');
 res.json({ok:true,moved:true,course_id:lesson.course_id,lesson_id:id,direction});
});
}