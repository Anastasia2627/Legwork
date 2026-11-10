/**
 * Customer-held personal data export and reviewable deletion requests.
 * Financial / legal retention and payment disputes are not safely deletable
 * without an approved policy: this module does not pretend to erase records.
 */
export function registerAccountDataRoutes(app,db,{auth,admin,verifyPassword,mail}){
 db.exec([
  "CREATE TABLE IF NOT EXISTS account_deletion_requests(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_review')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_open_unique ON account_deletion_requests(user_id)"
 ].join(';')+';');
 const selectOptional=(table,sql,args)=>{
  const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return exists?db.prepare(sql).all(...args):[];
 };
 app.get('/api/account/data-export',auth,(req,res)=>{
  const uid=req.user.id;
  const user=db.prepare('SELECT id,email,name,instagram,role,email_verified_at FROM users WHERE id=?').get(uid);
  if(!user)return res.status(404).json({error:'Account not found'});
  const data={
   exported_at:new Date().toISOString(),
   warning:'This export includes private data and links. Store it securely. It does not include payment card details or private lesson streams.',
   profile:user,
   course_enrollments:db.prepare('SELECT e.course_id,c.title AS course,e.tier FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? ORDER BY e.course_id').all(uid),
   individual_lessons:db.prepare('SELECT l.id,l.title FROM lesson_access a JOIN lessons l ON l.id=a.lesson_id WHERE a.user_id=? ORDER BY l.id').all(uid),
   lesson_progress:db.prepare('SELECT p.lesson_id,l.title,p.completed,p.homework_url FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.user_id=? ORDER BY p.lesson_id').all(uid),
   teacher_feedback:selectOptional('homework_reviews','SELECT lesson_id,feedback,reviewed_at,approved FROM homework_reviews WHERE user_id=? ORDER BY lesson_id',[uid]),
   mentorship_requests:db.prepare('SELECT id,package,video_url,experience,goals,status,feedback,created_at,instagram,training_frequency,teaching FROM mentorships WHERE user_id=? ORDER BY id').all(uid),
   orders:db.prepare('SELECT id,kind,item_id,amount,plan,status,created_at FROM orders WHERE user_id=? ORDER BY id').all(uid),
   payment_attempts:selectOptional('payment_attempts','SELECT id,provider,reference,usd_cents,uah_kopecks,currency,status,created_at,updated_at FROM payment_attempts WHERE user_id=? ORDER BY id',[uid]),
   certificates:selectOptional('certificates','SELECT course_id,serial,student_name,course_title,issued_at,revoked_at FROM certificates WHERE user_id=? ORDER BY id',[uid]),
   marketing_preferences:selectOptional('marketing_signups','SELECT purpose,consent_at,unsubscribed_at FROM marketing_signups WHERE email=? ORDER BY purpose',[user.email]),
   deletion_requests:db.prepare('SELECT status,created_at,updated_at FROM account_deletion_requests WHERE user_id=?').all(uid)
  };
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Content-Disposition','attachment; filename="legwork-my-data.json"');
  res.json(data);
 });
 app.get('/api/account/deletion-request',auth,(req,res)=>{
  const data=db.prepare('SELECT status,created_at,updated_at FROM account_deletion_requests WHERE user_id=?').get(req.user.id)||null;
  res.setHeader('Cache-Control','private, no-store');
  res.json({request:data});
 });
 app.post('/api/account/deletion-request',auth,(req,res)=>{
  if(req.user.role==='admin')return res.status(403).json({error:'School administrators must use the approved administrative account closure procedure'});
  const password=req.body?.password;
  if(typeof password!=='string'||password.length>128)return res.status(400).json({error:'Enter your current password'});
  const user=db.prepare('SELECT email,password_hash FROM users WHERE id=?').get(req.user.id);
  if(!user||!verifyPassword(password,user.password_hash))return res.status(403).json({error:'Current password is incorrect'});
  const existing=db.prepare('SELECT status,created_at FROM account_deletion_requests WHERE user_id=?').get(req.user.id);
  if(existing)return res.status(200).json({ok:true,status:existing.status,message:'Your existing account-closure request is still awaiting review. Your account has not been deleted.'});
  db.prepare("INSERT INTO account_deletion_requests(user_id,status) VALUES(?,'pending')").run(req.user.id);
  mail.notify(user.email,'account:deletion-request:'+req.user.id,'Legwork · Account closure request received','We received your request to close your Legwork account. It is waiting for a manual review of purchase and financial records. Your account and course access are not deleted yet. Contact the school for updates.');
  res.status(201).json({ok:true,status:'pending',message:'Account closure request received for manual review. No data has been erased yet.'});
 });
 app.get('/api/admin/deletion-requests',auth,admin,(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.json({requests:db.prepare("SELECT r.id,r.status,r.created_at,r.updated_at,u.id AS user_id,u.email,u.name FROM account_deletion_requests r JOIN users u ON u.id=r.user_id ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.created_at ASC LIMIT 200").all()});
 });
 app.post('/api/admin/deletion-requests/:id/review',auth,admin,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid request'});
  const changed=db.prepare("UPDATE account_deletion_requests SET status='in_review',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(id).changes;
  if(!changed)return res.status(409).json({error:'Request is not awaiting review'});
  res.json({ok:true,status:'in_review',message:'Flagged for review. No account data has been deleted.'});
 });
}
