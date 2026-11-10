import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import net from 'node:net';
import path from 'node:path';

const port=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n))})});
const request=async(base,url,{method='GET',data,cookie}={})=>{
 const res=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 return {status:res.status,data:await res.json().catch(()=>({})),cookie:res.headers.get('set-cookie')?.split(';')[0]};
};
test('Staff can manage non-sensitive public media slots, private users cannot',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-media-test-')),portNum=await port(),base='http://127.0.0.1:'+portNum;
 const env={...process.env,PORT:String(portNum),SITE_ORIGIN:base,NODE_ENV:'test',DATABASE_PATH:path.join(dir,'school.sqlite'),ADMIN_PASSWORD:'Test-media-admin-2026-very-strong',PAYMENT_PROVIDER:'disabled'};
 let child;const start=async()=>{
  child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
  let err='';child.stderr.on('data',part=>err+=part.toString());
  let ready=false;
  for(let i=0;i<100;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break}catch{}await new Promise(resolve=>setTimeout(resolve,80))}
  assert.ok(ready,'Media test server did not boot: '+err);
 };
 try{
  await start();
  const none=await request(base,'/api/media');assert.equal(none.status,200);
  assert.deepEqual(none.data.assets,{});
  assert.equal((await request(base,'/api/admin/media')).status,401);
  const student=await request(base,'/api/auth/register',{method:'POST',data:{email:'student-media@example.org',name:'Student',password:'Student-password-for-media-2026'}});
  assert.equal(student.status,200);
  assert.equal((await request(base,'/api/admin/media',{cookie:student.cookie})).status,403);
  const admin=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:env.ADMIN_PASSWORD}});
  assert.equal(admin.status,200);
  const data=await request(base,'/api/admin/media',{cookie:admin.cookie});
  assert.equal(data.status,200);
  assert.ok(data.data.slots.some(s=>s.key==='home_hero_video'&&s.type==='video'));
  assert.ok(data.data.slots.some(s=>s.key==='home_timeline_1'&&s.type==='image'));
  assert.ok(data.data.slots.some(s=>s.key==='account_course'));
  const uri='/api/admin/media/home_timeline_1';
  assert.equal((await request(base,uri,{method:'PATCH',cookie:student.cookie,data:{url:'https://example.com/image.jpg',alt:'Dance practice'}})).status,403);
  assert.equal((await request(base,'/api/admin/media/unknown',{method:'PATCH',cookie:admin.cookie,data:{url:''}})).status,404);
  assert.equal((await request(base,uri,{method:'PATCH',cookie:admin.cookie,data:{url:'javascript:alert(1)',alt:'Unsafe'}})).status,400);
  assert.equal((await request(base,uri,{method:'PATCH',cookie:admin.cookie,data:{url:'https://example.org/dance.jpg'}})).status,400);
  assert.equal((await request(base,uri,{method:'PATCH',cookie:admin.cookie,data:{url:'http://example.org/dance.jpg',alt:'Dance practice'}})).status,400);
  const valid={url:'https://example.org/dance-photo.jpg',alt:'Dancer practising legwork',credit:'School collection',source_url:'https://example.org/license'};
  assert.equal((await request(base,uri,{method:'PATCH',cookie:admin.cookie,data:valid})).status,200);
  const publicMedia=await request(base,'/api/media');
  assert.equal(publicMedia.data.assets.home_timeline_1.url,valid.url);
  assert.equal(publicMedia.data.assets.home_timeline_1.alt,valid.alt);
  assert.equal(publicMedia.data.assets.home_timeline_1.credit,valid.credit);
  assert.ok(!publicMedia.data.assets.private_lesson);
  child.kill('SIGTERM');await new Promise(resolve=>setTimeout(resolve,120));child=null;
  await start();
  const afterRestart=await request(base,'/api/media');
  assert.equal(afterRestart.data.assets.home_timeline_1.url,valid.url,'Public media must persist across restarts');
  const again=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:env.ADMIN_PASSWORD}});
  assert.equal((await request(base,uri,{method:'PATCH',cookie:again.cookie,data:{url:'',alt:'',credit:'',source_url:''}})).status,200);
  assert.equal((await request(base,'/api/media')).data.assets.home_timeline_1,undefined,'Clearing a slot restores its fallback');
 }finally{child?.kill('SIGTERM');await new Promise(resolve=>setTimeout(resolve,120));await rm(dir,{recursive:true,force:true})}
},{timeout:45000});
