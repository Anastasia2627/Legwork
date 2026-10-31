import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

const fonts={
 latin:path.join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'),
 cyrillic:path.join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff')
};
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const serialOk=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x);
const timestamp=()=>new Date().toISOString();
const clean=(value,max=120)=>String(value??'').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,max);

function renderPdf(record,url){
 if(!fs.existsSync(fonts.latin)||!fs.existsSync(fonts.cyrillic))throw Error('Noto Sans font dependencies missing');
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',layout:'landscape',margin:0,compress:true,info:{Title:'Legwork Certificate of Completion',Author:'Legwork Online School'}});
  const buffers=[];doc.on('data',b=>buffers.push(b));doc.on('end',()=>resolve(Buffer.concat(buffers)));doc.on('error',reject);
  const w=841.89,h=595.28;
  doc.rect(0,0,w,h).fill('#F7F6F3');doc.rect(19,19,w-38,h-38).lineWidth(1.2).stroke('#171717');
  doc.rect(26,26,8,h-52).fill('#D70736');doc.rect(46,48,w-92,4).fill('#D70736');
  doc.font('Helvetica-Bold').fontSize(21).fillColor('#161616').text('LEGWORK',70,67,{lineBreak:false});
  doc.font('Helvetica').fontSize(8).fillColor('#666666').text('ONLINE DANCE EDUCATION',70,95,{characterSpacing:2});
  doc.font('Helvetica-Bold').fontSize(34).fillColor('#161616').text('CERTIFICATE',58,160,{width:w-116,align:'center'});
  doc.font('Helvetica').fontSize(14).fillColor('#D70736').text('OF COURSE COMPLETION',58,207,{width:w-116,align:'center'});
  doc.font('Helvetica').fontSize(11).fillColor('#666666').text('This confirms that',60,260,{width:w-120,align:'center'});
  function centeredUnicode(value,y,size){
   const chunks=[];for(const ch of [...clean(value,110)]){const script=/[\u0400-\u052f]/u.test(ch)?'cyrillic':'latin';const last=chunks[chunks.length-1];if(last&&last.script===script)last.text+=ch;else chunks.push({script,text:ch})}
   const width=()=>chunks.reduce((sum,chunk)=>{doc.font(fonts[chunk.script]).fontSize(size);return sum+doc.widthOfString(chunk.text)},0);
   while(size>13&&width()>690)size-=1;
   let x=(w-width())/2;
   for(const chunk of chunks){doc.font(fonts[chunk.script]).fontSize(size).fillColor('#171717').text(chunk.text,x,y,{lineBreak:false});x+=doc.widthOfString(chunk.text)}
  }
  centeredUnicode(record.student_name,287,28);
  doc.font('Helvetica').fontSize(11).fillColor('#666666').text('has successfully completed',60,349,{width:w-120,align:'center'});
  centeredUnicode(record.course_title,379,19);
  doc.moveTo(66,448).lineTo(w-66,448).strokeColor('#D3D0CB').lineWidth(1).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#161616').text('ISSUED',68,469);
  doc.font('Helvetica').fontSize(11).fillColor('#333333').text(record.issued_at.slice(0,10),68,486);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#161616').text('CERTIFICATE ID',300,469);
  doc.font('Helvetica').fontSize(9).fillColor('#444444').text(record.serial,300,486);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#161616').text('VERIFICATION',625,469);
  doc.font('Helvetica').fontSize(9).fillColor('#333333').text('Verified online',625,486);
  doc.font('Helvetica').fontSize(8).fillColor('#707070').text('Issued by Legwork Online School. This certifies course completion, not professional accreditation.',58,524,{width:w-116,align:'center'});
  doc.font('Helvetica').fontSize(7).fillColor('#707070').text(clean(url,180),58,544,{width:w-116,align:'center',link:url,underline:true});
  doc.end();
 });
}

export function registerCertificateRoutes(app,db,{auth,admin,mail}){
 const addColumn=(table,column,definition)=>{if(!db.pragma('table_info('+table+')').some(x=>x.name===column))db.exec('ALTER TABLE '+table+' ADD COLUMN '+column+' '+definition)};
 addColumn('homework_reviews','approved','INTEGER NOT NULL DEFAULT 0');
 addColumn('homework_reviews','approved_at','TEXT');
 addColumn('homework_reviews','approved_by','INTEGER REFERENCES users(id)');
 db.exec('CREATE TABLE IF NOT EXISTS certificates(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),course_id INTEGER NOT NULL REFERENCES courses(id),serial TEXT NOT NULL UNIQUE,student_name TEXT NOT NULL,course_title TEXT NOT NULL,issued_at TEXT NOT NULL,issued_by INTEGER NOT NULL REFERENCES users(id),revoked_at TEXT,revoked_by INTEGER REFERENCES users(id),revoke_reason TEXT,UNIQUE(user_id,course_id))');
 const enroll=db.prepare("SELECT e.user_id,e.course_id,e.tier,u.name,c.title FROM enrollments e JOIN users u ON u.id=e.user_id JOIN courses c ON c.id=e.course_id WHERE e.user_id=? AND e.course_id=? AND e.tier='guru'");
 const reqs=db.prepare("SELECT l.id,l.title,CASE WHEN p.completed=1 THEN 1 ELSE 0 END completed,CASE WHEN LENGTH(COALESCE(p.homework_url,''))>0 THEN 1 ELSE 0 END submitted,CASE WHEN r.approved=1 AND LENGTH(COALESCE(r.feedback,''))>0 THEN 1 ELSE 0 END approved FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=? LEFT JOIN homework_reviews r ON r.lesson_id=l.id AND r.user_id=? WHERE l.course_id=? ORDER BY l.sort_order,l.id");
 const eligibility=(uid,cid)=>{
  const e=enroll.get(uid,cid);if(!e)return null;
  const rows=reqs.all(uid,uid,cid),total=rows.length,completed=rows.filter(x=>x.completed===1).length,
    submitted=rows.filter(x=>x.submitted===1).length,approved=rows.filter(x=>x.completed===1&&x.submitted===1&&x.approved===1).length;
  return {user_id:uid,course_id:cid,student_name:e.name,course_title:e.title,tier:'guru',total,completed,submitted,approved,eligible:total>0&&completed===total&&submitted===total&&approved===total};
 };
 const current=db.prepare('SELECT id,user_id,course_id,serial,student_name,course_title,issued_at,revoked_at FROM certificates WHERE user_id=? AND course_id=?');
 app.get('/api/account/certificates',auth,(req,res)=>{
  const c=db.prepare("SELECT course_id FROM enrollments WHERE user_id=? AND tier='guru'").all(req.user.id);
  res.setHeader('Cache-Control','private, no-store');
  res.json({certificates:c.map(row=>({...eligibility(req.user.id,row.course_id),certificate:current.get(req.user.id,row.course_id)||null}))});
 });
 app.get('/api/admin/certificates',auth,admin,(req,res)=>{
  const c=db.prepare("SELECT user_id,course_id FROM enrollments WHERE tier='guru' ORDER BY course_id,user_id LIMIT 300").all();
  const issued=db.prepare('SELECT id,user_id,course_id,serial,student_name,course_title,issued_at,revoked_at FROM certificates ORDER BY id DESC LIMIT 300').all();
  res.json({courses:c.map(row=>({...eligibility(row.user_id,row.course_id),certificate:current.get(row.user_id,row.course_id)||null})),issued});
 });
 app.post('/api/admin/homework/:userId/:lessonId/approve',auth,admin,(req,res)=>{
  const uid=Number(req.params.userId),lid=Number(req.params.lessonId);
  if(!positive(uid)||!positive(lid)||typeof req.body?.approved!=='boolean')return res.status(400).json({error:'Invalid approval request'});
  const lesson=db.prepare('SELECT course_id FROM lessons WHERE id=?').get(lid);
  if(!lesson||!enroll.get(uid,lesson.course_id))return res.status(404).json({error:'Guru homework not found'});
  const work=db.prepare('SELECT p.completed,p.homework_url,r.feedback FROM progress p JOIN homework_reviews r ON r.user_id=p.user_id AND r.lesson_id=p.lesson_id WHERE p.user_id=? AND p.lesson_id=?').get(uid,lid);
  if(!work?.completed||!work.homework_url||!work.feedback)return res.status(409).json({error:'Homework must be completed, submitted and reviewed before approval'});
  db.prepare('UPDATE homework_reviews SET approved=?,approved_at=?,approved_by=? WHERE user_id=? AND lesson_id=?').run(req.body.approved?1:0,req.body.approved?timestamp():null,req.body.approved?req.user.id:null,uid,lid);
  res.json({ok:true,approved:req.body.approved});
 });
 app.post('/api/admin/certificates/issue',auth,admin,(req,res)=>{
  const uid=Number(req.body?.user_id),cid=Number(req.body?.course_id);
  if(!positive(uid)||!positive(cid))return res.status(400).json({error:'Invalid student or course'});
  let result;
  try{
   result=db.transaction(()=>{
    const status=eligibility(uid,cid);
    if(!status)return {code:404,error:'Guru enrollment not found'};
    const previous=current.get(uid,cid);
    if(previous)return {code:409,error:previous.revoked_at?'Certificate revoked; contact support':'Certificate already issued'};
    if(!status.eligible)return {code:409,error:'Requirements incomplete: '+status.approved+'/'+status.total+' lessons approved'};
    const serial=crypto.randomUUID(),issuedAt=timestamp();
    const inserted=db.prepare('INSERT INTO certificates(user_id,course_id,serial,student_name,course_title,issued_at,issued_by) VALUES(?,?,?,?,?,?,?)').run(uid,cid,serial,clean(status.student_name,80),clean(status.course_title,120),issuedAt,req.user.id);
    return {certificate:{id:Number(inserted.lastInsertRowid),serial,student_name:status.student_name,course_title:status.course_title,issued_at:issuedAt}};
   })();
  }catch{return res.status(409).json({error:'Certificate already issued or database conflict'})}
  if(result.code)return res.status(result.code).json({error:result.error});
  const email=db.prepare('SELECT email FROM users WHERE id=?').get(uid)?.email;
  if(email&&mail)mail.notify(email,'certificate:issued:'+result.certificate.serial,'Legwork · Your certificate is ready','Your course completion certificate is ready. Open Achievements in your account to download it.');
  res.status(201).json({certificate:result.certificate});
 });
 app.post('/api/admin/certificates/:serial/revoke',auth,admin,(req,res)=>{
  if(!serialOk(req.params.serial))return res.status(400).json({error:'Invalid certificate'});
  const reason=typeof req.body?.reason==='string'?clean(req.body.reason,250):'';
  if(reason.length<8)return res.status(400).json({error:'Provide a reason of at least 8 characters'});
  const r=db.prepare('UPDATE certificates SET revoked_at=?,revoked_by=?,revoke_reason=? WHERE serial=? AND revoked_at IS NULL').run(timestamp(),req.user.id,reason,req.params.serial);
  if(!r.changes)return res.status(409).json({error:'Certificate not found or already revoked'});
  res.json({ok:true});
 });
 app.get('/api/certificates/verify/:serial',(req,res)=>{
  if(!serialOk(req.params.serial))return res.status(400).json({error:'Invalid certificate'});
  const c=db.prepare('SELECT serial,student_name,course_title,issued_at,revoked_at FROM certificates WHERE serial=?').get(req.params.serial);
  res.setHeader('Cache-Control','no-store');if(!c)return res.status(404).json({valid:false,error:'Certificate not found'});
  res.json({serial:c.serial,student_name:c.student_name,course_title:c.course_title,issued_at:c.issued_at,valid:!c.revoked_at});
 });
 app.get('/api/certificates/:serial/pdf',auth,async(req,res)=>{
  if(!serialOk(req.params.serial))return res.status(400).json({error:'Invalid certificate'});
  const c=db.prepare('SELECT * FROM certificates WHERE serial=?').get(req.params.serial);
  if(!c)return res.status(404).json({error:'Certificate not found'});
  if(c.user_id!==req.user.id&&req.user.role!=='admin')return res.status(403).json({error:'Forbidden'});
  if(c.revoked_at)return res.status(410).json({error:'Certificate was revoked'});
  let origin=process.env.SITE_ORIGIN||'http://localhost:3000';try{origin=new URL(origin).origin}catch{origin='http://localhost:3000'}
  try{
   const pdf=await renderPdf(c,origin+'/#/verify-certificate/'+encodeURIComponent(c.serial));
   res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','private, no-store');
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Content-Disposition','attachment; filename="legwork-certificate-'+c.serial+'.pdf"');
   res.send(pdf);
  }catch(e){console.error('Certificate render failed:',e.message);res.status(500).json({error:'Could not generate certificate'})}
 });
}
