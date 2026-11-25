import crypto from 'node:crypto';

/**
 * Password-confirmed, read-only, paginated SQLite + KV-image export.
 * An encrypted archive is built by scripts/backup-cloudflare.mjs ON THE
 * OWNER'S COMPUTER, never assembled inside a Durable Object request.
 * A portable backup is not transactionally consistent across live writes;
 * export during a controlled maintenance window, then verify offline.
 */
const TOKEN_DURATION_MS=20*60_000;
const ALLOWED_NAME=/^[A-Za-z_][A-Za-z0-9_]{0,90}$/;
const IMAGE_NAME=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sessionBinding=req=>{const token=/\blegwork_session=([a-f0-9]{64})\b/.exec(req.headers.cookie||'')?.[1];return token?sha(token):null;};
const noStore=res=>res.setHeader('Cache-Control','private, no-store');
const sqlName=s=>'"'+s.replaceAll('"','""')+'"';
const allowedTable=name=>ALLOWED_NAME.test(name)&&!name.startsWith('sqlite_')&&!name.startsWith('__cf_')&&name!=='backup_access_sessions';
const tableList=db=>db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name").all().filter(row=>allowedTable(row.name));
const metadata=db=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('index','trigger','view') AND sql IS NOT NULL ORDER BY type,name").all()
 .filter(row=>row.sql&&row.tbl_name!=='backup_access_sessions'&&!row.name.startsWith('sqlite_')&&!row.name.startsWith('__cf_'));
const jsonRow=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>{
 if(Buffer.isBuffer(value)||value instanceof Uint8Array){
  return [key,{_legwork_binary_base64:Buffer.from(value).toString('base64')}];
 }
 return [key,value];
}));

export function registerCloudflareBackupRoutes(app,db,{auth,admin,ctx,verifyPassword}){
 db.exec('CREATE TABLE IF NOT EXISTS backup_access_sessions(token_hash TEXT PRIMARY KEY,admin_user_id INTEGER NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)');
 if(!db.pragma('table_info(backup_access_sessions)').some(c=>c.name==='session_binding'))db.exec("ALTER TABLE backup_access_sessions ADD COLUMN session_binding TEXT NOT NULL DEFAULT ''");
 const verifyToken=(req,res,next)=>{
  noStore(res);
  const token=req.get('X-Legwork-Backup-Token');
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return res.status(403).json({error:'A short-lived backup token is required'});
  const hash=sha(token),binding=sessionBinding(req);
  const session=binding&&db.prepare('SELECT 1 FROM backup_access_sessions WHERE token_hash=? AND admin_user_id=? AND session_binding=? AND expires_at>?').get(hash,req.user.id,binding,Date.now());
  if(!session)return res.status(403).json({error:'Backup token expired or invalid'});
  next();
 };
 app.get('/api/admin/backup',auth,admin,(req,res)=>{
  noStore(res);res.json({supported:true,export:'paginated-sql-and-kv-images',max_session_minutes:20,
   encrypted_archive_created_by:'owner CLI',page_digest_verification:true,restore_endpoint:false,independent_backup_verified:false});
 });
 app.post('/api/admin/backup/start',auth,admin,(req,res)=>{
  noStore(res);
  const password=req.body?.password;
  if(typeof password!=='string'||!password||password.length>128)return res.status(400).json({error:'Confirm administrator password'});
  const user=db.prepare("SELECT password_hash FROM users WHERE id=? AND role='admin'").get(req.user.id);
  if(!user||!verifyPassword(password,user.password_hash))return res.status(403).json({error:'Invalid administrator password'});
  const binding=sessionBinding(req);if(!binding)return res.status(403).json({error:'Administrator session required'});
  const now=Date.now();
  db.prepare('DELETE FROM backup_access_sessions WHERE expires_at<=?').run(now);
  const active=db.prepare('SELECT COUNT(*) n FROM backup_access_sessions WHERE admin_user_id=?').get(req.user.id).n;
  if(active>=2)return res.status(429).json({error:'End an existing export before starting another'});
  const token=crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO backup_access_sessions(token_hash,admin_user_id,created_at,expires_at,session_binding) VALUES(?,?,?,?,?)')
   .run(sha(token),req.user.id,now,now+TOKEN_DURATION_MS,binding);
  res.status(201).json({token,expires_at:now+TOKEN_DURATION_MS,warning:'Live writes can change paginated exports. Export during maintenance and verify independently.'});
 });
 app.get('/api/admin/backup/manifest',auth,admin,verifyToken,(req,res)=>{
  noStore(res);
  const tables=tableList(db).map(item=>({...item,rows:db.prepare('SELECT COUNT(*) n FROM '+sqlName(item.name)).get().n}));
  const indexes=metadata(db);
  const images=db.prepare('SELECT name,bytes,uploaded_at FROM uploaded_images ORDER BY name').all();
  res.json({format:'LEGWORK-PORTABLE-1',exported_at:new Date().toISOString(),
   tables,indexes,images,image_prefix:'public-image:',
   total_rows:tables.reduce((n,t)=>n+Number(t.rows),0),
   total_image_bytes:images.reduce((n,i)=>n+Number(i.bytes),0)});
 });
 app.get('/api/admin/backup/table/:name',auth,admin,verifyToken,(req,res)=>{
  noStore(res);
  const name=req.params.name,offset=Number(req.query.offset||0),limit=Number(req.query.limit||100);
  if(!allowedTable(name)||!tableList(db).some(t=>t.name===name))return res.status(404).json({error:'Table not found'});
  if(!Number.isSafeInteger(offset)||offset<0||offset>10_000_000||!Number.isSafeInteger(limit)||limit<1||limit>200)
   return res.status(400).json({error:'Invalid pagination'});
  const rows=db.prepare('SELECT * FROM '+sqlName(name)+' ORDER BY rowid LIMIT ? OFFSET ?').all(limit,offset);
  const serialized=rows.map(jsonRow),digest=sha(JSON.stringify(serialized));
  if(req.query.digest==='1')return res.json({table:name,offset,count:rows.length,sha256:digest});
  res.json({table:name,offset,rows:serialized,sha256:digest,next_offset:rows.length===limit?offset+rows.length:null});
 });
 app.get('/api/admin/backup/media/:name',auth,admin,verifyToken,(req,res)=>{
  noStore(res);
  const name=req.params.name;
  if(!IMAGE_NAME.test(name)||!db.prepare('SELECT 1 FROM uploaded_images WHERE name=?').get(name))
   return res.status(404).json({error:'Image not found'});
  const raw=ctx?.storage?.kv?.get('public-image:'+name);
  if(!raw)return res.status(503).json({error:'Referenced image missing from storage'});
  const data=Buffer.from(raw);
  const expected=db.prepare('SELECT bytes FROM uploaded_images WHERE name=?').get(name)?.bytes;
  if(data.byteLength!==expected)return res.status(503).json({error:'Image storage size mismatch'});
  res.setHeader('Content-Type','image/webp');
  res.setHeader('X-Legwork-Sha256',crypto.createHash('sha256').update(data).digest('hex'));
  res.setHeader('Content-Disposition','attachment; filename="image.webp"');
  res.send(data);
 });
 app.post('/api/admin/backup/finish',auth,admin,verifyToken,(req,res)=>{
  noStore(res);
  const digest=crypto.createHash('sha256').update(req.get('X-Legwork-Backup-Token')).digest('hex');
  db.prepare('DELETE FROM backup_access_sessions WHERE token_hash=? AND admin_user_id=?').run(digest,req.user.id);
  res.json({ok:true});
 });
}
