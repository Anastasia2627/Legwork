import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {youtubeVideoId} from '../lib/security.js';

const videoId='dQw4w9WgXcQ';
test('YouTube validator accepts exact video URLs and rejects malicious look-alikes',()=>{
 for(const url of [
  'https://youtu.be/'+videoId,
  'https://www.youtube.com/watch?v='+videoId,
  'https://m.youtube.com/watch?v='+videoId+'&t=12s',
  'https://youtube.com/shorts/'+videoId,
  'https://www.youtube-nocookie.com/embed/'+videoId,
  'https://youtube.com/live/'+videoId
 ])assert.equal(youtubeVideoId(url),videoId,url);
 for(const url of [
  'http://youtube.com/watch?v='+videoId,'https://youtube.com.evil.example/watch?v='+videoId,
  'https://evil.youtube.com/watch?v='+videoId,'https://example.com/youtube.com/watch?v='+videoId,
  'https://youtube.com/watch?v=short','https://youtube.com/playlist?list='+videoId,
  'https://youtube.com/watch?v='+videoId+'#unsafe','javascript:alert(1)','https://vimeo.com/123456',
  'https://youtube.com@evil.example/watch?v='+videoId,
  'https://youtube.com:8080/watch?v='+videoId
 ])assert.equal(youtubeVideoId(url),null,url);
});

const randomPort=()=>new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port))})});
async function req(base,url,{cookie,method='GET',data}={}){
 const response=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 return {status:response.status,data:await response.json().catch(()=>({})),headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
test('Paid YouTube video links stay inside entitled API responses; students control other sessions',async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'legwork-youtube-security-'));
 const port=await randomPort(),base='http://127.0.0.1:'+port,adminPass='YoutubeTestAdminPassword-2026';
 const environment={...process.env,PORT:String(port),DATABASE_PATH:path.join(temp,'legwork.sqlite'),ADMIN_PASSWORD:adminPass,SITE_ORIGIN:base,NODE_ENV:'test',PAYMENT_PROVIDER:'disabled'};
 const server=spawn(process.execPath,['server.js'],{env:environment,cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
 let logs='';server.stderr.on('data',chunk=>logs+=chunk.toString());
 try{
  let started=false;
  for(let i=0;i<90;i++){try{started=(await fetch(base+'/health')).ok;if(started)break}catch{}await new Promise(r=>setTimeout(r,70))}
  assert.ok(started,'Server failed to boot: '+logs);
  const catalog=await req(base,'/api/lessons');
  assert.equal(catalog.status,200);
  assert.ok(!JSON.stringify(catalog.data).includes(videoId));
  const home=await fetch(base+'/');
  assert.ok(!(await home.text()).includes(videoId),'YouTube video ID must not be rendered in public HTML');
  assert.equal((await req(base,'/api/learning/2')).status,401);
  const register=await req(base,'/api/auth/register',{method:'POST',data:{name:'Security Student',email:'security-student@example.org',password:'SecurityStudentPassword-2026'}});
  assert.equal(register.status,200);
  const cookie=register.cookie;
  const admin=await req(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:adminPass}});
  assert.equal(admin.status,200);
  const invalid=['https://youtube.com.evil.example/watch?v='+videoId,'https://vimeo.com/123456','http://youtube.com/watch?v='+videoId];
  for(const video_url of invalid){
   const rejected=await req(base,'/api/admin/lessons/2/full',{method:'PATCH',cookie:admin.cookie,data:{video_url}});
   assert.equal(rejected.status,400,video_url);
  }
  assert.equal((await req(base,'/api/admin/lessons/2/full',{method:'PATCH',cookie,data:{video_url:'https://youtu.be/'+videoId}})).status,403);
  const good=await req(base,'/api/admin/lessons/2/full',{method:'PATCH',cookie:admin.cookie,data:{video_url:'https://youtu.be/'+videoId}});
  assert.equal(good.status,200);
  const publicLesson=await req(base,'/api/lessons');
  assert.equal(publicLesson.status,200);
  assert.equal(JSON.stringify(publicLesson.data).includes(videoId),false);
  const publicBundle=await req(base,'/api/bundles');
  assert.equal(JSON.stringify(publicBundle.data).includes(videoId),false);
  assert.equal((await req(base,'/api/learning/2',{cookie})).status,403);
  assert.equal((await req(base,'/api/lessons/2/watch',{cookie})).status,403);
  const order=await req(base,'/api/orders',{method:'POST',cookie,data:{kind:'course',item_id:1}});
  assert.equal(order.status,201);
  assert.equal((await req(base,'/api/learning/2',{cookie})).status,403,'Pending orders do not grant access');
  const granted=await req(base,'/api/admin/orders/'+order.data.id+'/approve',{cookie:admin.cookie,method:'POST',data:{}});
  assert.equal(granted.status,200);
  const authorized=await req(base,'/api/learning/2',{cookie});
  assert.equal(authorized.status,200);
  assert.equal(authorized.data.lesson.video_url,'https://youtu.be/'+videoId);
  assert.equal(JSON.stringify(authorized.data.syllabus).includes(videoId),false);
  assert.equal(authorized.headers.get('cache-control'),'private, no-store');
  const watch=await req(base,'/api/lessons/2/watch',{cookie});
  assert.equal(watch.status,200);
  assert.equal(watch.headers.get('cache-control'),'private, no-store');
  const second=await req(base,'/api/auth/login',{method:'POST',data:{email:'security-student@example.org',password:'SecurityStudentPassword-2026'}});
  assert.equal(second.status,200);
  assert.equal((await req(base,'/api/account/sessions',{cookie})).data.active_sessions,2);
  const wrong=await req(base,'/api/account/sessions/revoke-others',{method:'POST',cookie:second.cookie,data:{password:'wrong-password'}});
  assert.equal(wrong.status,403);
  assert.equal((await req(base,'/api/account/sessions',{cookie})).status,200,'Bad password must not revoke sessions');
  const success=await req(base,'/api/account/sessions/revoke-others',{method:'POST',cookie:second.cookie,data:{password:'SecurityStudentPassword-2026'}});
  assert.equal(success.status,200);assert.equal(success.data.revoked_sessions,1);
  assert.equal((await req(base,'/api/learning/2',{cookie})).status,401,'Old session must be invalidated');
  assert.equal((await req(base,'/api/learning/2',{cookie:second.cookie})).status,200);
  assert.equal((await req(base,'/api/account/sessions',{cookie:second.cookie})).data.active_sessions,1);
  const missing=await req(base,'/api/auth/login',{method:'POST',data:{email:'unknown-user@example.org',password:'wrong-password'}});
  assert.equal(missing.status,401);
  assert.equal((await fetch(base+'/api/learning/2')).headers.get('x-robots-tag'),'noindex, nofollow');
 }finally{server.kill('SIGTERM');await new Promise(r=>setTimeout(r,140));await rm(temp,{recursive:true,force:true})}
},{timeout:60000});
