import crypto from 'node:crypto';
import express from 'express';

/**
 * Small PRIVATE lesson documents stored in the same SQLite database as
 * entitlements, PITR checkpoints and encrypted independent SQL backups.
 * No public media URL, no external object-storage account and no paid video.
 *
 * Strictly bounded: individual binary <= 1 MiB, school-wide 40 MiB.
 * No inline rendering. PDF/image files are untrusted and downloadable only.
 */
const MAX_FILE=1024*1024;
const MAX_TOTAL=40*1024*1024;
const FILE_TYPES=['application/pdf','image/jpeg','image/png','image/webp'];
const PDF='application/pdf';
const validId=value=>/^[1-9]\d{0,10}$/.test(String(value))&&Number.isSafeInteger(Number(value));
const noStore=res=>res.setHeader('Cache-Control','private, no-store');
const titleOf=value=>typeof value==='string'?value.trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,100):'';
const onlyPDF=bytes=>bytes.subarray(0,5).toString()==='%PDF-'&&bytes.subarray(Math.max(0,bytes.length-2048)).includes(Buffer.from('%%EOF'));
export function validLearningFile(bytes,mime){
 if(!Buffer.isBuffer(bytes)||bytes.length<24||bytes.length>MAX_FILE||!FILE_TYPES.includes(mime))return false;
 if(mime===PDF)return onlyPDF(bytes);
 if(mime==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.includes(Buffer.from('IEND'),Math.max(0,bytes.length-40));
 if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217;
 if(mime==='image/webp')return bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length;
 return false;
}
export const homeworkFilePath=(userId,lessonId)=>'/api/learning/homework-files/'+userId+'/'+lessonId+'/download';
const meta=row=>({id:row.id,lesson_id:row.lesson_id,title:row.title,mime:row.mime,bytes:row.bytes,created_at:row.created_at});
export function registerPrivateLearningRoutes(app,db,{auth,admin,mail}){
 db.exec("CREATE TABLE IF NOT EXISTS private_learning_files("+
  "id INTEGER PRIMARY KEY,lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,"+
  "owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('material','homework')),"+
  "title TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,base64_data TEXT NOT NULL,"+
  "created_at INTEGER NOT NULL)");
 db.exec("CREATE INDEX IF NOT EXISTS private_learning_lesson ON private_learning_files(lesson_id,kind)");
 db.exec("CREATE UNIQUE INDEX IF NOT EXISTS private_learning_homework_owner ON private_learning_files(owner_id,lesson_id) WHERE kind='homework'");
 const lesson=db.prepare("SELECT l.id,l.course_id,l.free,c.active FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=?");
 const enrolled=db.prepare('SELECT tier FROM enrollments WHERE user_id=? AND course_id=?');
 const one=db.prepare('SELECT 1 FROM lesson_access WHERE user_id=? AND lesson_id=?');
 const isAllowed=(user,l)=>user.role==='admin'||(l.active===1&&
  (l.free===1||!!enrolled.get(user.id,l.course_id)||!!one.get(user.id,l.id)));
 const isGuru=(user,l)=>user.role!=='admin'&&l.active===1&&enrolled.get(user.id,l.course_id)?.tier==='guru';
 const sumBytes=db.prepare('SELECT COALESCE(SUM(bytes),0) total FROM private_learning_files');
 const checkQuota=(length,old=0)=>sumBytes.get().total-old+length<=MAX_TOTAL;
 const raw=express.raw({type:()=>true,limit:'1050kb'});
 const save=(lessonId,userId,kind,title,mime,body)=>{
  const hash=crypto.createHash('sha256').update(body).digest('hex');
  const r=db.prepare('INSERT INTO private_learning_files(lesson_id,owner_id,kind,title,mime,bytes,sha256,base64_data,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(lessonId,userId,kind,title,mime,body.length,hash,body.toString('base64'),Date.now());
  return Number(r.lastInsertRowid);
 };
 const sendFile=(req,res,row)=>{
  if(!row)return res.status(404).json({error:'File not found'});
  const data=Buffer.from(row.base64_data,'base64');
  const sha=crypto.createHash('sha256').update(data).digest('hex');
  if(data.length!==row.bytes||sha!==row.sha256)return res.status(503).json({error:'Stored file failed integrity verification'});
  noStore(res);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
  res.setHeader('Content-Type',row.mime);
  res.setHeader('Content-Disposition','attachment; filename="'+(row.mime==='application/pdf'?'legwork-document.pdf':row.mime==='image/png'?'legwork-practice.png':row.mime==='image/webp'?'legwork-practice.webp':'legwork-practice.jpg')+'"');
  res.setHeader('Content-Length',data.length);
  res.send(data);
 };
 // Student: list and download class notes, but only after entitlement checks.
 app.get('/api/learning/:id/materials',auth,(req,res)=>{
  noStore(res);
  if(!validId(req.params.id))return res.status(400).json({error:'Invalid lesson ID'});
  const l=lesson.get(Number(req.params.id));
  if(!l)return res.status(404).json({error:'Lesson not found'});
  if(!isAllowed(req.user,l))return res.status(403).json({error:'Lesson access required'});
  res.json({materials:db.prepare("SELECT id,lesson_id,title,mime,bytes,created_at FROM private_learning_files WHERE kind='material' AND lesson_id=? ORDER BY id").all(l.id)});
 });
 app.get('/api/learning/materials/:fileId/download',auth,(req,res)=>{
  if(!validId(req.params.fileId))return res.status(404).end();
  const row=db.prepare("SELECT * FROM private_learning_files WHERE id=? AND kind='material'").get(Number(req.params.fileId));
  if(!row)return res.status(404).end();
  const l=lesson.get(row.lesson_id);
  if(!l||!isAllowed(req.user,l))return res.status(403).json({error:'Lesson access required'});
  return sendFile(req,res,row);
 });
 // Teacher: bounded PDF upload and intentional deletion (no public upload).
 app.post('/api/admin/lessons/:id/materials',auth,admin,raw,(req,res)=>{
  noStore(res);
  if(!validId(req.params.id)||!lesson.get(Number(req.params.id)))return res.status(404).json({error:'Lesson not found'});
  const mime=String(req.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(mime!==PDF)return res.status(415).json({error:'Only PDF study notes are supported'});
  if(!validLearningFile(req.body,mime))return res.status(422).json({error:'Invalid PDF or file larger than 1 MiB'});
  const title=titleOf(req.query.title);
  if(!title)return res.status(400).json({error:'Provide a PDF title'});
  if(!checkQuota(req.body.length))return res.status(413).json({error:'Private school document quota reached'});
  const count=db.prepare("SELECT COUNT(*) n FROM private_learning_files WHERE kind='material' AND lesson_id=?").get(Number(req.params.id)).n;
  if(count>=10)return res.status(409).json({error:'Maximum ten PDF notes per lesson'});
  const id=save(Number(req.params.id),null,'material',title,mime,req.body);
  res.status(201).json({material:{id,lesson_id:Number(req.params.id),title,mime,bytes:req.body.length}});
 });
 app.delete('/api/admin/materials/:fileId',auth,admin,(req,res)=>{
  noStore(res);
  if(!validId(req.params.fileId))return res.status(400).json({error:'Invalid document ID'});
  const changed=db.prepare("DELETE FROM private_learning_files WHERE id=? AND kind='material'").run(Number(req.params.fileId)).changes;
  res.status(changed?200:404).json(changed?{ok:true}:{error:'Material not found'});
 });
 // Guru student: private PDF/image homework. Video stays an HTTPS link.
 app.post('/api/learning/:id/homework-file',auth,raw,(req,res)=>{
  noStore(res);
  if(!validId(req.params.id))return res.status(400).json({error:'Invalid lesson ID'});
  const l=lesson.get(Number(req.params.id));
  if(!l)return res.status(404).json({error:'Lesson not found'});
  if(!isGuru(req.user,l))return res.status(403).json({error:'File homework upload requires a Guru enrollment'});
  const mime=String(req.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!FILE_TYPES.includes(mime))return res.status(415).json({error:'Upload PDF, PNG, JPEG or WebP only. Use HTTPS links for videos'});
  if(!validLearningFile(req.body,mime))return res.status(422).json({error:'Unsupported or oversized file (1 MiB maximum)'});
  const previous=db.prepare("SELECT id,bytes FROM private_learning_files WHERE kind='homework' AND owner_id=? AND lesson_id=?")
   .get(req.user.id,l.id);
  if(!checkQuota(req.body.length,previous?.bytes||0))return res.status(413).json({error:'Private storage quota reached'});
  let newId;
  db.transaction(()=>{
   if(previous)db.prepare('DELETE FROM private_learning_files WHERE id=?').run(previous.id);
   newId=save(l.id,req.user.id,'homework','Practice attachment',mime,req.body);
   const old=db.prepare('SELECT completed FROM progress WHERE user_id=? AND lesson_id=?').get(req.user.id,l.id);
   const link=homeworkFilePath(req.user.id,l.id);
   db.prepare('INSERT INTO progress(user_id,lesson_id,completed,homework_url) VALUES(?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET homework_url=excluded.homework_url')
    .run(req.user.id,l.id,old?.completed===1?1:0,link);
   db.prepare('DELETE FROM homework_reviews WHERE user_id=? AND lesson_id=?').run(req.user.id,l.id);
  })();
  mail?.notify?.(req.user.email,'homework:uploaded:'+req.user.id+':'+l.id+':'+newId,
   'Legwork · Your homework was saved','Your private homework attachment was saved. Your teacher can review it when your practice is completed.');
  res.status(201).json({ok:true,homework_url:homeworkFilePath(req.user.id,l.id),bytes:req.body.length});
 });
 app.get('/api/learning/homework-files/:userId/:lessonId/download',auth,(req,res)=>{
  noStore(res);
  if(!validId(req.params.userId)||!validId(req.params.lessonId))return res.status(404).end();
  const userId=Number(req.params.userId),lessonId=Number(req.params.lessonId);
  if(req.user.role!=='admin'&&req.user.id!==userId)return res.status(403).json({error:'Not your homework'});
  const l=lesson.get(lessonId);
  if(!l)return res.status(404).end();
  if(req.user.role!=='admin'&&!isGuru(req.user,l))return res.status(403).json({error:'Guru access required'});
  const row=db.prepare("SELECT * FROM private_learning_files WHERE owner_id=? AND lesson_id=? AND kind='homework'").get(userId,lessonId);
  return sendFile(req,res,row);
 });
 app.delete('/api/learning/:id/homework-file',auth,(req,res)=>{
  noStore(res);
  if(!validId(req.params.id))return res.status(400).json({error:'Invalid lesson ID'});
  const l=lesson.get(Number(req.params.id));
  if(!l)return res.status(404).json({error:'Lesson not found'});
  const previous=db.prepare("SELECT id FROM private_learning_files WHERE kind='homework' AND owner_id=? AND lesson_id=?").get(req.user.id,l.id);
  if(!previous)return res.status(404).json({error:'No homework attachment'});
  db.transaction(()=>{
   db.prepare('DELETE FROM private_learning_files WHERE id=?').run(previous.id);
   db.prepare("UPDATE progress SET homework_url='' WHERE user_id=? AND lesson_id=? AND homework_url=?")
    .run(req.user.id,l.id,homeworkFilePath(req.user.id,l.id));
   db.prepare('DELETE FROM homework_reviews WHERE user_id=? AND lesson_id=?').run(req.user.id,l.id);
  })();
  res.json({ok:true});
 });
 return {homeworkFilePath};
}
