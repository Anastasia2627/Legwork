import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import net from 'node:net';
import path from 'node:path';
import sharp from 'sharp';

const getPort=()=>new Promise(resolve=>{const sock=net.createServer();sock.listen(0,'127.0.0.1',()=>{const value=sock.address().port;sock.close(()=>resolve(value))})});
const json=async(base,url,{method='GET',data,cookie}={})=>{
 const response=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 return {status:response.status,body:await response.json().catch(()=>({})),cookie:response.headers.get('set-cookie')?.split(';')[0]};
};
test('Image upload validates bytes, strips metadata and only serves approved public images',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-upload-')),port=await getPort(),base='http://127.0.0.1:'+port;
 const env={...process.env,PORT:String(port),NODE_ENV:'test',SITE_ORIGIN:base,DATABASE_PATH:path.join(dir,'school.sqlite'),ADMIN_PASSWORD:'MediaTestAdminStrongPassword-2048',PAYMENT_PROVIDER:'disabled'};
 const server=spawn(process.execPath,['server.js'],{env,cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
 let stderr='';server.stderr.on('data',d=>stderr+=d);
 try{
  let ready=false;for(let i=0;i<90;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break}catch{}await new Promise(resolve=>setTimeout(resolve,90))}
  assert.ok(ready,'Server did not start: '+stderr);
  const auth=await json(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:env.ADMIN_PASSWORD}});
  assert.equal(auth.status,200);
  const student=await json(base,'/api/auth/register',{method:'POST',data:{email:'uploadteststudent@example.org',name:'Upload Student',password:'UploadTestStudentPassword-2026'}});
  assert.equal(student.status,200);
  const source=await sharp({create:{width:800,height:500,channels:3,background:'#d6c1a2'}}).png().withMetadata({exif:{IFD0:{Copyright:'Internal team'}}}).toBuffer();
  const upload=async(body,type,cookie)=>fetch(base+'/api/admin/image-upload',{method:'POST',headers:{'Content-Type':type,...(cookie?{Cookie:cookie}:{})},body});
  assert.equal((await upload(source,'image/png')).status,401);
  assert.equal((await upload(source,'image/png',student.cookie)).status,403);
  assert.equal((await upload(Buffer.from('<svg></svg>'),'image/svg+xml',auth.cookie)).status,415);
  assert.equal((await upload(Buffer.from('corrupted jpeg data!!'),'image/jpeg',auth.cookie)).status,422);
  assert.equal((await upload(source,'image/jpeg',auth.cookie)).status,415);
  const uploaded=await upload(source,'image/png',auth.cookie);
  assert.equal(uploaded.status,201);
  const {url,format,bytes}=await uploaded.json();
  assert.equal(format,'webp');assert.ok(bytes>0);
  assert.match(url,/^\/media\/[0-9a-f-]+\.webp$/);
  assert.equal((await fetch(base+url)).status,404,'Unassigned uploads are private');
  const saved=await json(base,'/api/admin/media/home_timeline_1',{method:'PATCH',cookie:auth.cookie,data:{url,alt:'Student practising a dance technique',credit:'School media'}});
  assert.equal(saved.status,200);
  const publicResponse=await fetch(base+url);
  assert.equal(publicResponse.status,200);
  assert.equal(publicResponse.headers.get('content-type'),'image/webp');
  const publicBody=Buffer.from(await publicResponse.arrayBuffer());
  const metadata=await sharp(publicBody).metadata();
  assert.equal(metadata.format,'webp');
  assert.equal(metadata.width,800);assert.equal(metadata.height,500);
  assert.equal(metadata.exif,undefined,'Original embedded EXIF must not be retained');
  assert.equal((await json(base,'/api/media')).body.assets.home_timeline_1.url,url);
  assert.equal((await json(base,'/api/admin/media/home_timeline_1',{method:'PATCH',cookie:auth.cookie,data:{url:'',alt:'',credit:'',source_url:''}})).status,200);
  assert.equal((await fetch(base+url)).status,404,'Cleared media must no longer be served');
  const cover=await json(base,'/api/admin/lessons/1/full',{method:'PATCH',cookie:auth.cookie,data:{cover_url:url}});
  assert.equal(cover.status,200,'Previously uploaded images can be assigned as covers');
  assert.equal((await fetch(base+url)).status,200,'Referenced lesson covers are public');
  assert.equal((await json(base,'/api/admin/lessons/1/full',{method:'PATCH',cookie:auth.cookie,data:{cover_url:'/media/../../secrets'}})).status,400);
 }finally{server.kill('SIGTERM');await new Promise(resolve=>setTimeout(resolve,140));await rm(dir,{recursive:true,force:true})}
},{timeout:60000});
