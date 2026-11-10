import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import net from 'node:net';
import path from 'node:path';
const getPort=()=>new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port))})});
async function request(base,url,{method='GET',data,cookie}={}){
 const res=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 return {status:res.status,headers:res.headers,body:await res.json().catch(()=>({})),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
test('Students export only their own learning data and may request account closure with password confirmation',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-personal-data-')),port=await getPort(),base='http://127.0.0.1:'+port;
 const env={...process.env,PORT:String(port),SITE_ORIGIN:base,NODE_ENV:'test',DATABASE_PATH:path.join(dir,'school.sqlite'),ADMIN_PASSWORD:'AccountDataAdminPassword-2026',PAYMENT_PROVIDER:'disabled'};
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d);
 try{
  let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break}catch{}await new Promise(r=>setTimeout(r,90))}
  assert.ok(ready,'Server failed to start: '+stderr);
  assert.equal((await request(base,'/api/account/data-export')).status,401);
  const userOne=await request(base,'/api/auth/register',{method:'POST',data:{name:'First Test',email:'first-account@example.org',password:'FirstUserSecurePassword-2026'}});
  const userTwo=await request(base,'/api/auth/register',{method:'POST',data:{name:'Second Test',email:'second-account@example.org',password:'SecondUserSecurePassword-2026'}});
  assert.equal(userOne.status,200);assert.equal(userTwo.status,200);
  const order=await request(base,'/api/orders',{method:'POST',cookie:userOne.cookie,data:{kind:'course',item_id:1}});
  assert.equal(order.status,201);
  const mentor=await request(base,'/api/mentorships',{method:'POST',cookie:userOne.cookie,data:{package:'Basic',video_url:'https://example.org/student-one-private-video',goals:'Transitions'}});
  assert.equal(mentor.status,201);
  const exported=await request(base,'/api/account/data-export',{cookie:userOne.cookie});
  assert.equal(exported.status,200);
  assert.match(exported.headers.get('content-disposition'),/attachment/);
  assert.match(exported.headers.get('cache-control'),/no-store/);
  assert.equal(exported.body.profile.email,'first-account@example.org');
  assert.equal(exported.body.orders.length,1);
  assert.equal(exported.body.mentorship_requests.length,1);
  assert.equal(exported.body.mentorship_requests[0].goals,'Transitions');
  assert.equal(JSON.stringify(exported.body).includes('Second Test'),false,'Must not leak other users');
  assert.equal(JSON.stringify(exported.body).includes('password_hash'),false);
  assert.equal(JSON.stringify(exported.body).includes('video_url":"https://youtube'),false,'Private paid video streams must not be exported');
  const second=await request(base,'/api/account/data-export',{cookie:userTwo.cookie});
  assert.equal(second.body.profile.email,'second-account@example.org');
  assert.equal(second.body.orders.length,0);
  assert.equal(second.body.mentorship_requests.length,0);
  assert.equal((await request(base,'/api/account/deletion-request',{method:'POST',cookie:userOne.cookie,data:{password:'wrong'}})).status,403);
  assert.equal((await request(base,'/api/account/deletion-request',{method:'POST',cookie:userTwo.cookie,data:{password:'FirstUserSecurePassword-2026'}})).status,403);
  const created=await request(base,'/api/account/deletion-request',{method:'POST',cookie:userOne.cookie,data:{password:'FirstUserSecurePassword-2026'}});
  assert.equal(created.status,201);
  assert.equal(created.body.status,'pending');
  assert.equal((await request(base,'/api/account/deletion-request',{method:'POST',cookie:userOne.cookie,data:{password:'FirstUserSecurePassword-2026'}})).status,200,'Duplicate closure requests should be idempotent');
  assert.equal((await request(base,'/api/account/deletion-request',{cookie:userOne.cookie})).body.request.status,'pending');
  assert.equal((await request(base,'/api/admin/deletion-requests',{cookie:userOne.cookie})).status,403);
  const admin=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:env.ADMIN_PASSWORD}});
  assert.equal(admin.status,200);
  const queue=await request(base,'/api/admin/deletion-requests',{cookie:admin.cookie});
  assert.equal(queue.status,200);
  assert.equal(queue.body.requests.length,1);
  const requestId=queue.body.requests[0].id;
  assert.equal((await request(base,'/api/admin/deletion-requests/'+requestId+'/review',{method:'POST',cookie:userOne.cookie,data:{}})).status,403);
  const reviewed=await request(base,'/api/admin/deletion-requests/'+requestId+'/review',{method:'POST',cookie:admin.cookie,data:{}});
  assert.equal(reviewed.status,200);
  assert.equal((await request(base,'/api/account/deletion-request',{cookie:userOne.cookie})).body.request.status,'in_review');
  assert.equal((await request(base,'/api/admin/deletion-requests/'+requestId+'/review',{method:'POST',cookie:admin.cookie,data:{}})).status,409);
  assert.equal((await request(base,'/api/dashboard',{cookie:userOne.cookie})).status,200,'Reviewing is not silent deletion');
 }finally{child.kill('SIGTERM');await new Promise(r=>setTimeout(r,130));await rm(dir,{recursive:true,force:true})}
},{timeout:50000});
