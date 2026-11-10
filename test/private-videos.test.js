import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

const nextPort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})});
const mp4=()=>{
 const bytes=Buffer.alloc(512);
 bytes.writeUInt32BE(24,0);bytes.write('ftyp',4);bytes.write('isom',8);bytes.writeUInt32BE(0,12);bytes.write('isomiso2',16);bytes.fill(0x42,24);
 return bytes;
};
async function json(base,url,{method='GET',data,cookie}={}){
 const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 const body=await r.json().catch(()=>({}));
 return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function video(base,url,bytes,contentType,cookie){
 return fetch(base+url,{method:'POST',headers:{'Content-Type':contentType,...(cookie?{Cookie:cookie}:{})},body:bytes});
}
test('Private videos require ownership for lesson and homework, stream ranges, and revoke on removal',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-private-videos-')),port=await nextPort(),base='http://127.0.0.1:'+port;
 const env={...process.env,PORT:String(port),NODE_ENV:'test',DATABASE_PATH:path.join(dir,'school.sqlite'),SITE_ORIGIN:base,ADMIN_PASSWORD:'Video-Test-Admin-Password-2026',PAYMENT_PROVIDER:'disabled'};
 let child,errors='';
 const start=async()=>{
  child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',part=>errors+=part.toString());
  let ready=false;
  for(let i=0;i<110;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break}catch{}await new Promise(resolve=>setTimeout(resolve,70))}
  assert.ok(ready,'Server could not start: '+errors);
 };
 try{
  await start();
  const admin=await json(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:env.ADMIN_PASSWORD}});
  const alice=await json(base,'/api/auth/register',{method:'POST',data:{name:'Alice Practice',email:'alice-practice@example.org',password:'Alice-Secure-Video-Password-2026'}});
  const bob=await json(base,'/api/auth/register',{method:'POST',data:{name:'Bob Practice',email:'bob-practice@example.org',password:'Bob-Secure-Video-Password-2026'}});
  assert.equal(admin.status,200);assert.equal(alice.status,200);assert.equal(bob.status,200);
  const clip=mp4();
  assert.equal((await video(base,'/api/admin/lesson-videos/2',clip,'video/mp4')).status,401);
  assert.equal((await video(base,'/api/admin/lesson-videos/2',clip,'video/mp4',alice.cookie)).status,403);
  assert.equal((await video(base,'/api/admin/lesson-videos/2',clip,'video/webm',admin.cookie)).status,422);
  assert.equal((await video(base,'/api/admin/lesson-videos/2',Buffer.from('<svg/onload=alert(1)>'),'video/mp4',admin.cookie)).status,422);
  assert.equal((await video(base,'/api/admin/lesson-videos/2',clip,'image/png',admin.cookie)).status,415);
  const saved=await video(base,'/api/admin/lesson-videos/2',clip,'video/mp4',admin.cookie);
  assert.equal(saved.status,201);assert.equal((await saved.json()).video_url,'/api/lesson-videos/2');
  assert.equal((await fetch(base+'/api/lesson-videos/2')).status,401);
  assert.equal((await fetch(base+'/api/lesson-videos/2',{headers:{Cookie:alice.cookie}})).status,403);
  assert.equal((await fetch(base+'/api/lesson-videos/2',{headers:{Cookie:bob.cookie}})).status,403);
  const aliceId=alice.body.user.id;
  assert.equal((await json(base,'/api/admin/enroll',{cookie:admin.cookie,method:'POST',data:{user_id:aliceId,course_id:1,tier:'guru'}})).status,200);
  const learner=await json(base,'/api/learning/2',{cookie:alice.cookie});
  assert.equal(learner.status,200);
  assert.equal(learner.body.lesson.video_url,'/api/lesson-videos/2');
  assert.equal(learner.body.syllabus.some(x=>x.video_url),false,'Do not leak other lesson streams in syllabus');
  const normal=await fetch(base+'/api/lesson-videos/2',{headers:{Cookie:alice.cookie}});
  assert.equal(normal.status,200);
  assert.equal(normal.headers.get('content-type'),'video/mp4');
  assert.equal(normal.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(Buffer.from(await normal.arrayBuffer()),clip);
  const ranged=await fetch(base+'/api/lesson-videos/2',{headers:{Cookie:alice.cookie,Range:'bytes=0-15'}});
  assert.equal(ranged.status,206);assert.equal(ranged.headers.get('content-range'),'bytes 0-15/512');
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),clip.subarray(0,16));
  assert.equal((await fetch(base+'/api/lesson-videos/2',{headers:{Cookie:alice.cookie,Range:'bytes=2048-2500'}})).status,416);
  assert.equal((await fetch(base+'/api/lesson-videos/2',{method:'HEAD',headers:{Cookie:alice.cookie}})).status,200);
  assert.equal((await video(base,'/api/homework-videos/2',clip,'video/mp4',bob.cookie)).status,403);
  const uploaded=await video(base,'/api/homework-videos/2',clip,'video/mp4',alice.cookie);
  assert.equal(uploaded.status,201);assert.equal((await uploaded.json()).video_url,'/api/homework-videos/2');
  assert.equal((await fetch(base+'/api/homework-videos/2')).status,401);
  assert.equal((await fetch(base+'/api/homework-videos/2',{headers:{Cookie:bob.cookie}})).status,404);
  assert.equal((await fetch(base+'/api/homework-videos/2?user_id='+aliceId,{headers:{Cookie:bob.cookie}})).status,404);
  assert.equal((await fetch(base+'/api/homework-videos/2?user_id='+aliceId,{headers:{Cookie:admin.cookie}})).status,200);
  const lesson=await json(base,'/api/learning/2',{cookie:alice.cookie});
  assert.equal(lesson.body.lesson.homework_url,'/api/homework-videos/2');
  assert.equal((await json(base,'/api/progress/2',{method:'POST',cookie:alice.cookie,data:{completed:true,homework_url:'/api/homework-videos/2'}})).status,200);
  assert.equal((await json(base,'/api/progress/2',{method:'POST',cookie:bob.cookie,data:{completed:true,homework_url:'/api/homework-videos/2'}})).status,403);
  const queue=await json(base,'/api/admin/homework',{cookie:admin.cookie});
  assert.equal(queue.status,200);
  assert.equal(queue.body.homework.find(x=>x.user_id===aliceId&&x.lesson_id===2).homework_url,'/api/homework-videos/2');
  child.kill('SIGTERM');child=null;await new Promise(resolve=>setTimeout(resolve,120));
  await start();
  assert.equal((await fetch(base+'/api/lesson-videos/2',{headers:{Cookie:alice.cookie}})).status,200,'Uploaded video should survive restart');
  assert.equal((await fetch(base+'/api/homework-videos/2',{headers:{Cookie:alice.cookie}})).status,200,'Homework should survive restart');
  assert.equal((await json(base,'/api/admin/lesson-videos/2',{cookie:admin.cookie,method:'DELETE'})).status,200);
  assert.equal((await fetch(base+'/api/lesson-videos/2',{headers:{Cookie:alice.cookie}})).status,404);
  assert.equal((await json(base,'/api/learning/2',{cookie:alice.cookie})).body.lesson.video_url,null);
  assert.equal((await json(base,'/api/progress/2',{method:'POST',cookie:alice.cookie,data:{completed:true,homework_url:'https://example.org/my-new-video'}})).status,200);
  assert.equal((await fetch(base+'/api/homework-videos/2',{headers:{Cookie:alice.cookie}})).status,404,'Replacing video with external URL revokes access to prior upload');
 }finally{child?.kill('SIGTERM');await new Promise(resolve=>setTimeout(resolve,120));await rm(dir,{recursive:true,force:true})}
},{timeout:65000});
