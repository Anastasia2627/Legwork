import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';

/**
 * Small, locally hosted classroom/practice videos.
 * These files are NEVER served from express.static and every video request
 * re-checks the current authenticated student's ownership.
 * Limit 40 MiB per clip: long courses should use an external video platform.
 */
const MAX_VIDEO=40*1024*1024;
const fileRegex=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(mp4|webm)$/;
const positive=id=>Number.isSafeInteger(Number(id))&&Number(id)>0&&String(Number(id))===String(id);
const mime={mp4:'video/mp4',webm:'video/webm'};
const fileInfo=(bytes,contentType)=>{
 if(!Buffer.isBuffer(bytes)||bytes.length<16)return null;
 if(contentType==='video/mp4'&&bytes.toString('ascii',4,8)==='ftyp'&&bytes.readUInt32BE(0)>=8&&bytes.readUInt32BE(0)<=bytes.length)return 'mp4';
 if(contentType==='video/webm'&&bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))&&bytes.subarray(0,512).includes(Buffer.from('webm')))return 'webm';
 return null;
};
export function registerPrivateVideos(app,db,{auth,admin,mail,storagePath}){
 const location=path.resolve(process.env.PRIVATE_VIDEO_DIR||path.join(path.dirname(path.resolve(storagePath)),'private-videos'));
 fs.mkdirSync(location,{recursive:true,mode:0o700});
 const addColumn=(table,name)=>{if(!db.pragma('table_info('+table+')').some(c=>c.name===name))db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' TEXT')};
 addColumn('lessons','private_video_filename');
 addColumn('progress','homework_video_filename');
 const getLesson=db.prepare('SELECT l.id,l.course_id,l.free,l.private_video_filename FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=? AND c.active=1');
 const enrolled=db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?');
 const bought=db.prepare('SELECT 1 FROM lesson_access WHERE user_id=? AND lesson_id=?');
 const allowed=(user,lesson)=>!!user&&(user.role==='admin'||lesson.free===1||!!enrolled.get(user.id,lesson.course_id)||!!bought.get(user.id,lesson.id));
 const teacherHomework=db.prepare('SELECT homework_video_filename,homework_url FROM progress WHERE user_id=? AND lesson_id=?');
 const raw=express.raw({type:()=>true,limit:MAX_VIDEO});
 const sendVideo=async(req,res,filename)=>{
  if(!filename||!fileRegex.test(filename))return res.status(404).end();
  const absolute=path.join(location,filename);
  try{
   const file=await fsp.stat(absolute);
   if(!file.isFile())return res.status(404).end();
   const size=file.size,range=req.get('range'),ext=filename.split('.').pop();
   res.setHeader('Content-Type',mime[ext]);
   res.setHeader('Cache-Control','private, no-store');
   res.setHeader('Accept-Ranges','bytes');
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Content-Disposition','inline');
   let start=0,end=size-1;
   if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if(!match||(!match[1]&&!match[2])){res.setHeader('Content-Range','bytes */'+size);return res.status(416).end()}
    if(!match[1]){
     const suffix=Number(match[2]);
     if(!Number.isSafeInteger(suffix)||suffix<1){res.setHeader('Content-Range','bytes */'+size);return res.status(416).end()}
     start=Math.max(0,size-suffix);
    }else{
     start=Number(match[1]);
     if(match[2])end=Number(match[2]);
    }
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end||end>=size){res.setHeader('Content-Range','bytes */'+size);return res.status(416).end()}
    res.status(206);res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+size);
   }
   res.setHeader('Content-Length',end-start+1);
   if(req.method==='HEAD')return res.end();
   const stream=fs.createReadStream(absolute,{start,end});
   stream.on('error',()=>{if(!res.headersSent)res.status(500).end();else res.destroy()});
   stream.pipe(res);
  }catch{if(!res.headersSent)res.status(404).end()}
 };
 app.get('/api/lesson-videos/:id',auth,(req,res)=>{
  if(!positive(req.params.id))return res.status(400).json({error:'Invalid lesson'});
  const lesson=getLesson.get(Number(req.params.id));
  if(!lesson)return res.status(404).end();
  if(!allowed(req.user,lesson))return res.status(403).json({error:'Lesson access required'});
  return sendVideo(req,res,lesson.private_video_filename);
 });
 app.head('/api/lesson-videos/:id',auth,(req,res)=>{
  if(!positive(req.params.id))return res.status(404).end();
  const lesson=getLesson.get(Number(req.params.id));
  if(!lesson||!allowed(req.user,lesson))return res.status(404).end();
  return sendVideo(req,res,lesson.private_video_filename);
 });
 app.get('/api/homework-videos/:id',auth,(req,res)=>{
  if(!positive(req.params.id))return res.status(400).json({error:'Invalid lesson'});
  const student=req.user.role==='admin'&&positive(req.query.user_id)?Number(req.query.user_id):req.user.id;
  const row=teacherHomework.get(student,Number(req.params.id));
  return sendVideo(req,res,row?.homework_video_filename);
 });
 app.head('/api/homework-videos/:id',auth,(req,res)=>{
  if(!positive(req.params.id))return res.status(404).end();
  const student=req.user.role==='admin'&&positive(req.query.user_id)?Number(req.query.user_id):req.user.id;
  return sendVideo(req,res,teacherHomework.get(student,Number(req.params.id))?.homework_video_filename);
 });
 async function upload(req,res,assign){
  const type=String(req.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!['video/mp4','video/webm'].includes(type))return res.status(415).json({error:'Choose MP4 or WebM video'});
  const ext=fileInfo(req.body,type);
  if(!ext)return res.status(422).json({error:'Video format is invalid or does not match the file type'});
  const filename=crypto.randomUUID()+'.'+ext,absolute=path.join(location,filename);
  try{
   await fsp.writeFile(absolute,req.body,{flag:'wx',mode:0o600});
   const previous=assign(filename);
   res.setHeader('Cache-Control','no-store');
   res.status(201).json({ok:true,video_url:previous.url,message:'Video uploaded. Playback is restricted to authorized accounts.'});
  }catch(e){
   await fsp.unlink(absolute).catch(()=>{});
   return res.status(500).json({error:'Video could not be saved'});
  }
 }
 app.post('/api/admin/lesson-videos/:id',auth,admin,raw,(req,res)=>{
  if(!positive(req.params.id))return res.status(400).json({error:'Invalid lesson'});
  const id=Number(req.params.id),lesson=getLesson.get(id);
  if(!lesson)return res.status(404).json({error:'Lesson not found'});
  return upload(req,res,filename=>{
   db.prepare('UPDATE lessons SET private_video_filename=? WHERE id=?').run(filename,id);
   return {url:'/api/lesson-videos/'+id};
  });
 });
 app.delete('/api/admin/lesson-videos/:id',auth,admin,(req,res)=>{
  if(!positive(req.params.id))return res.status(400).json({error:'Invalid lesson'});
  const id=Number(req.params.id);
  if(!getLesson.get(id))return res.status(404).json({error:'Lesson not found'});
  db.prepare('UPDATE lessons SET private_video_filename=NULL WHERE id=?').run(id);
  res.json({ok:true,message:'Private video removed from lesson. The external URL, if set, will be used.'});
 });
 app.post('/api/homework-videos/:id',auth,raw,(req,res)=>{
  if(!positive(req.params.id))return res.status(400).json({error:'Invalid lesson'});
  const id=Number(req.params.id),lesson=getLesson.get(id);
  if(!lesson)return res.status(404).json({error:'Lesson not found'});
  if(!allowed(req.user,lesson))return res.status(403).json({error:'Lesson access required'});
  const url='/api/homework-videos/'+id;
  return upload(req,res,filename=>{
   db.transaction(()=>{
    db.prepare("INSERT INTO progress(user_id,lesson_id,completed,homework_url,homework_video_filename) VALUES(?,?,0,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET homework_url=excluded.homework_url,homework_video_filename=excluded.homework_video_filename").run(req.user.id,id,url,filename);
    db.prepare('UPDATE homework_reviews SET approved=0,approved_at=NULL,approved_by=NULL WHERE user_id=? AND lesson_id=?').run(req.user.id,id);
   })();
   const guru=db.prepare("SELECT 1 FROM enrollments WHERE user_id=? AND course_id=? AND tier='guru'").get(req.user.id,lesson.course_id);
   if(guru){
    const student=db.prepare('SELECT email FROM users WHERE role=? ORDER BY id LIMIT 1').get('admin');
    if(student)mail.notify(student.email,'homework:uploaded:'+req.user.id+':'+id+':'+filename,'Legwork · New homework video','A Guru student uploaded practice video for lesson #'+id+'. Sign in to review it.');
   }
   return {url};
  });
 });
 const cleanup=async()=>{
  try{
   const referenced=new Set([
    ...db.prepare('SELECT private_video_filename AS filename FROM lessons WHERE private_video_filename IS NOT NULL').all(),
    ...db.prepare('SELECT homework_video_filename AS filename FROM progress WHERE homework_video_filename IS NOT NULL').all()
   ].map(row=>row.filename));
   for(const file of await fsp.readdir(location,{withFileTypes:true})){
    if(!file.isFile()||!fileRegex.test(file.name)||referenced.has(file.name))continue;
    const stat=await fsp.stat(path.join(location,file.name));
    if(Date.now()-stat.mtimeMs>=48*3600*1000)await fsp.unlink(path.join(location,file.name));
   }
  }catch(error){console.error('Private video cleanup:',error.code||'unknown')}
 };
 const job=setInterval(()=>void cleanup(),6*3600*1000);job.unref();
 void cleanup();
}
