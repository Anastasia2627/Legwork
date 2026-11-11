/**
 * Bounded, append-only application-level security activity trail.
 * Records privileged actions and login/session security events but never
 * passwords, session cookies, email bodies, private YouTube URLs or request bodies.
 *
 * This is not an immutable database ledger: a database administrator can still
 * edit SQLite, and off-site log forwarding is required for incident forensics.
 */
export function registerSecurityAudit(app,db,{getUser}){
 db.exec([
  "CREATE TABLE IF NOT EXISTS security_audit(id INTEGER PRIMARY KEY,occurred_at INTEGER NOT NULL,actor_user_id INTEGER,action TEXT NOT NULL,outcome TEXT NOT NULL CHECK(outcome IN ('success','denied','failed')),http_status INTEGER NOT NULL,target_type TEXT NOT NULL DEFAULT '',target_id TEXT NOT NULL DEFAULT '',details_json TEXT NOT NULL DEFAULT '{}')",
  "CREATE INDEX IF NOT EXISTS security_audit_time ON security_audit(id DESC)",
  "CREATE INDEX IF NOT EXISTS security_audit_actor ON security_audit(actor_user_id,id DESC)"
 ].join(';')+';');
 const insert=db.prepare('INSERT INTO security_audit(occurred_at,actor_user_id,action,outcome,http_status,target_type,target_id,details_json) VALUES(?,?,?,?,?,?,?,?)');
 const safeId=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?String(n):''};
 const keepDetails=data=>{
  const out={};
  if(!data||typeof data!=='object')return out;
  for(const [key,value] of Object.entries(data)){
   if(!['course_id','lesson_id','order_id','user_id','tier','transaction_status','reference','slot'].includes(key))continue;
   if(typeof value==='string'||typeof value==='number')out[key]=String(value).slice(0,100);
  }
  return out;
 };
 const record=({actorId=null,action,outcome='success',status=200,targetType='',targetId='',details={}})=>{
  const actor=safeId(actorId);
  if(!/^[a-z][a-z0-9._-]{2,79}$/.test(String(action)))return;
  try{
   insert.run(Date.now(),actor?Number(actor):null,action,outcome,status,String(targetType).slice(0,32),String(targetId).slice(0,72),JSON.stringify(keepDetails(details)));
  }catch(error){console.error('Security audit record failed:',error.code||'unknown')}
 };
 const retention=parseInt(process.env.SECURITY_AUDIT_RETENTION_DAYS||'180',10);
 const days=Number.isSafeInteger(retention)&&retention>=30&&retention<=730?retention:180;
 const prune=()=>{try{db.prepare('DELETE FROM security_audit WHERE occurred_at<?').run(Date.now()-days*86400000)}catch(error){console.error('Security audit cleanup:',error.code||'unknown')}};
 prune();
 const timer=setInterval(prune,24*3600*1000);timer.unref();
 const classify=(pathname,req)=>{
  if(pathname==='/api/payments/wayforpay/webhook'){
   const reference=req.body?.orderReference,transactionStatus=req.body?.transactionStatus;
   return {action:'payment.provider_callback',targetType:'payment',targetId:typeof reference==='string'?reference:'',details:{transaction_status:transactionStatus,reference}};
  }
  if(pathname==='/api/account/sessions/revoke-others')return {action:'account.sessions_revoke',targetType:'account'};
  if(pathname==='/api/account/change-password')return {action:'account.password_change',targetType:'account'};
  if(pathname==='/api/account/deletion-request')return {action:'account.closure_request',targetType:'account'};
  if(!pathname.startsWith('/api/admin/'))return null;
  const segments=pathname.split('/').filter(Boolean);
  if(segments.length>7)return null;
  const category=segments[2]||'other',id=segments[3]||'';
  if(category==='security-audit')return null;
  if(category==='enroll')return {
   action:'admin.access_grant',targetType:'account',targetId:safeId(req.body?.user_id),
   details:{user_id:req.body?.user_id,course_id:req.body?.course_id,tier:req.body?.tier}
  };
  if(category==='orders'&&segments[4]==='approve')return {action:'admin.order_approve',targetType:'order',targetId:safeId(id)};
  if(category==='mentorships'&&segments[4]==='verify-payment')return {action:'admin.mentorship_payment_verify',targetType:'mentorship',targetId:safeId(id)};
  if(category==='deletion-requests')return {action:'admin.account_closure_review',targetType:'closure_request',targetId:safeId(id)};
  if(category==='lessons')return {action:'admin.lesson_edit',targetType:'lesson',targetId:safeId(id)};
  if(category==='courses')return {action:'admin.course_edit',targetType:'course',targetId:safeId(id)};
  if(category==='media')return {action:'admin.media_edit',targetType:'media_slot',targetId:String(id).slice(0,72),details:{slot:id}};
  if(category==='bundles')return {action:'admin.bundle_edit',targetType:'bundle',targetId:safeId(id)};
  if(category==='certificates')return {action:'admin.certificate_action',targetType:'certificate',targetId:safeId(id)};
  return {action:'admin.privileged_action',targetType:category,targetId:safeId(id)};
 };
 app.use('/api',(req,res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  const pathname=new URL(req.originalUrl,'http://localhost').pathname;
  const entry=classify(pathname,req);
  if(!entry)return next();
  res.once('finish',()=>{
   const status=res.statusCode;
   if(status>=500)return; // service faults are covered by operational logs
   const actor=req.user?.id||getUser(req)?.id||null;
   if(!actor&&pathname!=='/api/payments/wayforpay/webhook')return; // prevent bot-driven audit spam
   const outcome=status>=200&&status<400?'success':status===401||status===403?'denied':'failed';
   record({actorId:actor,action:entry.action,outcome,status,targetType:entry.targetType,targetId:entry.targetId,details:entry.details});
  });
  next();
 });
 const registerRoutes=(auth,admin)=>app.get('/api/admin/security-audit',auth,admin,(req,res)=>{
  const limitParam=req.query.limit===undefined?50:Number(req.query.limit);
  const before=req.query.before===undefined?Number.MAX_SAFE_INTEGER:Number(req.query.before);
  if(!Number.isSafeInteger(limitParam)||limitParam<1||limitParam>100||!Number.isSafeInteger(before)||before<1)return res.status(400).json({error:'Invalid audit pagination'});
  const rows=db.prepare('SELECT a.id,a.occurred_at,a.actor_user_id,u.name AS actor_name,a.action,a.outcome,a.http_status,a.target_type,a.target_id,a.details_json FROM security_audit a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.id<? ORDER BY a.id DESC LIMIT ?').all(before,limitParam);
  res.setHeader('Cache-Control','private, no-store');
  res.json({events:rows.map(({details_json,...row})=>({...row,details:JSON.parse(details_json)})),next_before:rows.length===limitParam?rows[rows.length-1].id:null,retention_days:days});
 });
 return {record,registerRoutes};
}
