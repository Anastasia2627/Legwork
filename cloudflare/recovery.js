/**
 * Cloudflare's built-in 30-day SQLite Durable Object point-in-time recovery.
 * Bookmarks cover SQL tables AND synchronous-KV uploaded media. They are not
 * offsite files, permanent archives or an unreviewed one-click rollback.
 */
export const RECOVERY_WINDOW_DAYS=30;
const DAY=86400_000;
const MAX_POINTS_PER_DAY=6;
const validLabel=s=>typeof s==='string'&&s.trim().length>=4&&s.trim().length<=80&&/^[\p{L}\p{N} .,_()\-]+$/u.test(s);
export function registerCloudflareRecoveryRoutes(app,db,{auth,admin,ctx,verifyPassword}){
 db.exec("CREATE TABLE IF NOT EXISTS recovery_checkpoints(id INTEGER PRIMARY KEY,label TEXT NOT NULL,bookmark TEXT NOT NULL UNIQUE,created_by INTEGER NOT NULL,created_at INTEGER NOT NULL)");
 const headers=(res)=>res.setHeader('Cache-Control','private, no-store');
 const rows=()=>db.prepare('SELECT id,label,created_at FROM recovery_checkpoints ORDER BY created_at DESC,id DESC LIMIT 30').all();
 app.get('/api/admin/recovery',auth,admin,(req,res)=>{
  headers(res);
  const now=Date.now();
  const checkpoints=rows().map(r=>({...r,expires_at:r.created_at+RECOVERY_WINDOW_DAYS*DAY,expired:now>=r.created_at+29*DAY}));
  res.json({supported:true,kind:'cloudflare-pitr',window_days:RECOVERY_WINDOW_DAYS,
   restore_available_in_ui:false,checkpoints});
 });
 app.post('/api/admin/recovery/checkpoints',auth,admin,async(req,res)=>{
  headers(res);
  const label=req.body?.label,password=req.body?.password;
  if(!validLabel(label))return res.status(400).json({error:'Use a descriptive label of 4–80 characters'});
  if(typeof password!=='string'||password.length>128||!password)return res.status(400).json({error:'Confirm your administrator password'});
  const user=db.prepare('SELECT password_hash FROM users WHERE id=? AND role=?').get(req.user.id,'admin');
  if(!user||!verifyPassword(password,user.password_hash))return res.status(403).json({error:'Incorrect administrator password'});
  if(db.prepare('SELECT COUNT(*) AS total FROM recovery_checkpoints WHERE created_at>?').get(Date.now()-DAY).total>=MAX_POINTS_PER_DAY){
   return res.status(429).json({error:'Daily checkpoint limit reached'});
  }
  if(typeof ctx?.storage?.getCurrentBookmark!=='function'){
   return res.status(503).json({error:'Cloudflare point-in-time recovery unavailable'});
  }
  let bookmark;
  try{bookmark=await ctx.storage.getCurrentBookmark()}
  catch{return res.status(503).json({error:'Cloudflare recovery bookmarks unavailable in this environment'})}
  if(typeof bookmark!=='string'||!bookmark.length||bookmark.length>256)return res.status(503).json({error:'Invalid recovery bookmark from storage'});
  try{
   const now=Date.now();
   const saved=db.prepare('INSERT INTO recovery_checkpoints(label,bookmark,created_by,created_at) VALUES(?,?,?,?)')
    .run(label.trim(),bookmark,req.user.id,now);
   return res.status(201).json({ok:true,checkpoint:{id:saved.lastInsertRowid,label:label.trim(),
    created_at:now,expires_at:now+RECOVERY_WINDOW_DAYS*DAY},
    message:'Cloudflare recovery bookmark recorded. It expires in 30 days and is not an external backup.'});
  }catch{return res.status(409).json({error:'Recovery point could not be recorded. Please retry'})}
 });
 // The raw bookmark is accessible only after password re-entry. Never publish
 // it in the list or return full account details alongside it.
 app.post('/api/admin/recovery/checkpoints/:id/reveal',auth,admin,(req,res)=>{
  headers(res);
  const id=Number(req.params.id),password=req.body?.password;
  if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid checkpoint'});
  if(typeof password!=='string'||password.length>128||!password)return res.status(400).json({error:'Administrator password required'});
  const adminUser=db.prepare('SELECT password_hash FROM users WHERE id=? AND role=?').get(req.user.id,'admin');
  if(!adminUser||!verifyPassword(password,adminUser.password_hash))return res.status(403).json({error:'Incorrect administrator password'});
  const point=db.prepare('SELECT id,label,bookmark,created_at FROM recovery_checkpoints WHERE id=?').get(id);
  if(!point)return res.status(404).json({error:'Checkpoint not found'});
  if(Date.now()-point.created_at>=29*DAY)return res.status(410).json({error:'Checkpoint is approaching or past Cloudflare retention; use a newer point'});
  res.json({checkpoint:point,message:'Sensitive recovery bookmark. Store securely outside the project and follow the reviewed recovery procedure.'});
 });
 // Intentionally no public restore endpoint: recovery can rewind payments,
 // access grants, customer data and security sessions and needs a maintenance
 // window, reconciliation, fresh session secret and operator review.
}
