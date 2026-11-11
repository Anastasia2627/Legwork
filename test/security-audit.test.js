import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

const choosePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})});
async function request(base,url,{cookie,method='GET',data}={}){
 const response=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 return {status:response.status,body:await response.json().catch(()=>({})),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
test('privileged actions and sensitive account changes are audited without leaking secrets',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-audit-'));
 const port=await choosePort(),base='http://127.0.0.1:'+port;
 const adminPass='Strong-Audit-Admin-Password-2026',studentPass='Strong-Audit-Student-Password-2026';
 const env={...process.env,PORT:String(port),NODE_ENV:'test',DATABASE_PATH:path.join(dir,'school.sqlite'),SITE_ORIGIN:base,ADMIN_PASSWORD:adminPass,SESSION_SECRET:'audit-specific-test-session-secret-2026-very-long',PAYMENT_PROVIDER:'disabled'};
 const server=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
 let errors='';server.stderr.on('data',part=>errors+=part.toString());
 try{
  let ready=false;for(let i=0;i<95;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break}catch{}await new Promise(done=>setTimeout(done,70))}
  assert.ok(ready,'Test server failed to start: '+errors);
  assert.equal((await request(base,'/api/admin/security-audit')).status,401,'Guest cannot read activity');
  const student=await request(base,'/api/auth/register',{method:'POST',data:{email:'audit-student@example.org',name:'Audit Student',password:studentPass}});
  assert.equal(student.status,200);
  assert.equal((await request(base,'/api/admin/security-audit',{cookie:student.cookie})).status,403,'Students cannot read activity');
  const denied=await request(base,'/api/admin/enroll',{method:'POST',cookie:student.cookie,data:{user_id:student.body.user.id,course_id:1}});
  assert.equal(denied.status,403,'Students cannot grant their own access');
  const badAdmin=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:'wrong-password'}});
  assert.equal(badAdmin.status,401);
  const admin=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:adminPass}});
  assert.equal(admin.status,200);
  const granted=await request(base,'/api/admin/enroll',{method:'POST',cookie:admin.cookie,data:{user_id:student.body.user.id,course_id:1,tier:'guru',password:'NEVER_STORE_ME'}});
  assert.equal(granted.status,200);
  const order=await request(base,'/api/orders',{method:'POST',cookie:student.cookie,data:{kind:'lesson',item_id:22}});
  assert.equal(order.status,201);
  const approved=await request(base,'/api/admin/orders/'+order.body.id+'/approve',{method:'POST',cookie:admin.cookie,data:{password:'NEVER_STORE_ME'}});
  assert.equal(approved.status,200);
  const revoke=await request(base,'/api/account/sessions/revoke-others',{method:'POST',cookie:student.cookie,data:{password:studentPass}});
  assert.equal(revoke.status,200);
  const audit=await request(base,'/api/admin/security-audit?limit=100',{cookie:admin.cookie});
  assert.equal(audit.status,200);
  assert.equal(audit.headers.get('cache-control'),'private, no-store');
  const events=audit.body.events;
  assert.ok(events.some(x=>x.action==='auth.login'&&x.outcome==='success'));
  assert.ok(events.some(x=>x.action==='auth.login_rejected'&&x.outcome==='denied'));
  assert.ok(events.some(x=>x.action==='admin.access_grant'&&x.outcome==='denied'&&x.actor_user_id===student.body.user.id));
  assert.ok(events.some(x=>x.action==='admin.access_grant'&&x.outcome==='success'&&x.details.user_id===String(student.body.user.id)));
  assert.ok(events.some(x=>x.action==='admin.order_approve'&&x.outcome==='success'&&x.target_id===String(order.body.id)));
  assert.ok(events.some(x=>x.action==='account.sessions_revoke'&&x.outcome==='success'));
  assert.ok(events.every(x=>Number.isSafeInteger(x.occurred_at)&&x.occurred_at>0));
  const flattened=JSON.stringify(audit.body);
  assert.equal(flattened.includes(studentPass),false,'Do not log passwords');
  assert.equal(flattened.includes(adminPass),false,'Do not log admin credentials');
  assert.equal(flattened.includes('NEVER_STORE_ME'),false,'Do not log raw request bodies');
  assert.equal(flattened.includes('legwork_session='),false,'Do not log cookies');
  assert.equal(flattened.includes('audit-student@example.org'),false,'Do not include user email in audit events');
  assert.equal((await request(base,'/api/admin/security-audit?limit=101',{cookie:admin.cookie})).status,400);
  assert.equal((await request(base,'/api/admin/security-audit?before=-7',{cookie:admin.cookie})).status,400);
  const first=await request(base,'/api/admin/security-audit?limit=2',{cookie:admin.cookie});
  assert.equal(first.status,200);assert.equal(first.body.events.length,2);
  assert.ok(first.body.next_before>0);
  const next=await request(base,'/api/admin/security-audit?limit=2&before='+first.body.next_before,{cookie:admin.cookie});
  assert.equal(next.status,200);
  assert.ok(next.body.events.every(x=>x.id<first.body.next_before),'Pagination must not duplicate events');
  const unknown=await request(base,'/api/auth/login',{method:'POST',data:{email:'unknown-failure@example.org',password:'wrong-password'}});
  assert.equal(unknown.status,401);
  const after=await request(base,'/api/admin/security-audit',{cookie:admin.cookie});
  assert.equal(after.body.events.filter(x=>x.action==='auth.login_rejected').length,1,'Unknown usernames should not flood the audit log');
 }finally{
  server.kill('SIGTERM');
  await new Promise(done=>setTimeout(done,130));
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:55000});
