import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import sharp from 'sharp';

const MAX_INPUT_BYTES=6*1024*1024;
const MAX_OUTPUT_BYTES=7*1024*1024;
const NAME=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/i;
const INTERNAL_URL=/^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/i;
export const safePublicImageUrl=(url,externalCheck)=>INTERNAL_URL.test(url)||externalCheck(url);

/**
 * Public marketing images only. Uploaded binary data never contains executable
 * SVG/HTML, never uses the original filename and is decoded/re-encoded into WebP
 * to discard metadata such as EXIF GPS coordinates. Never put student/private
 * recordings or paid class files here.
 *
 * MEDIA_UPLOAD_DIR must live on the same persistent volume as SQLite.
 */
export function registerImageUploads(app,db,{auth,admin,dbPath}){
 const directory=path.resolve(process.env.MEDIA_UPLOAD_DIR||path.join(path.dirname(path.resolve(dbPath)),'public-media'));
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const isSupportedType=type=>['image/jpeg','image/png','image/webp'].includes(type);
 const raw=express.raw({type:()=>true,limit:MAX_INPUT_BYTES});
 app.post('/api/admin/image-upload',auth,admin,raw,async(req,res)=>{
  const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if(!isSupportedType(type))return res.status(415).json({error:'Upload a JPEG, PNG or WebP image'});
  if(!Buffer.isBuffer(req.body)||req.body.length<16)return res.status(400).json({error:'Choose a non-empty image'});
  let encoded;
  try{
   const input=sharp(req.body,{failOn:'error',limitInputPixels:20_000_000});
   const info=await input.metadata();
   if(!['jpeg','png','webp'].includes(info.format)||!info.width||!info.height)return res.status(415).json({error:'Unsupported image data'});
   if((info.format==='jpeg'&&type!=='image/jpeg')||(info.format==='png'&&type!=='image/png')||(info.format==='webp'&&type!=='image/webp'))return res.status(415).json({error:'Image content does not match the declared format'});
   encoded=await input.rotate().resize({width:2200,height:2200,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toBuffer();
  }catch{return res.status(422).json({error:'Image could not be decoded securely'})}
  if(encoded.length>MAX_OUTPUT_BYTES)return res.status(413).json({error:'Processed image is too large'});
  const filename=crypto.randomUUID()+'.webp';
  try{
   await fsp.writeFile(path.join(directory,filename),encoded,{flag:'wx',mode:0o600});
   res.setHeader('Cache-Control','no-store');
   res.status(201).json({url:'/media/'+filename,bytes:encoded.length,format:'webp'});
  }catch{return res.status(500).json({error:'Image could not be stored on the server'})}
 });
 app.get('/media/:name',async(req,res)=>{
  const name=String(req.params.name);
  if(!NAME.test(name))return res.status(404).end();
  const url='/media/'+name;
  // A file becomes publicly accessible only after an admin assigns it
  // to an approved public media slot or lesson cover.
  const referenced=db.prepare('SELECT 1 FROM site_media WHERE url=? UNION SELECT 1 FROM lessons WHERE cover_url=? LIMIT 1').get(url,url);
  if(!referenced)return res.status(404).end();
  const full=path.join(directory,name);
  try{
   const stat=await fsp.stat(full);
   if(!stat.isFile())return res.status(404).end();
   // Avoid long-lived stale copies after an admin unpublishes an image.
   res.setHeader('Cache-Control','public, max-age=300');
   res.setHeader('X-Content-Type-Options','nosniff');
   res.type('image/webp');
   res.sendFile(full,{dotfiles:'deny'},error=>{if(error&&!res.headersSent)res.status(error.statusCode||404).end()});
  }catch{return res.status(404).end()}
 });
 // Uploaded-but-unused images are short-lived. Referenced assets remain forever
 // until an administrator clears them; a periodic backup must include this dir.
 const cleanup=async()=>{
  const occupied=new Set([
   ...db.prepare("SELECT url FROM site_media WHERE url LIKE '/media/%'").all(),
   ...db.prepare("SELECT cover_url AS url FROM lessons WHERE cover_url LIKE '/media/%'").all()
  ].map(x=>x.url.slice('/media/'.length)));
  try{
   const files=await fsp.readdir(directory,{withFileTypes:true});
   for(const file of files){
    if(!file.isFile()||!NAME.test(file.name)||occupied.has(file.name))continue;
    const absolute=path.join(directory,file.name);
    const stat=await fsp.stat(absolute);
    if(Date.now()-stat.mtimeMs>48*3600_000)await fsp.unlink(absolute);
   }
  }catch(error){console.error('Image cleanup error:',error.code||'unknown')}
 };
 const job=setInterval(()=>void cleanup(),6*3600_000);job.unref();
 void cleanup();
}
