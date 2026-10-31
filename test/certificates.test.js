import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import net from 'node:net';
import path from 'node:path';
const port=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
async function request(base,route,{method='GET',data,cookie}={}){
 const r=await fetch(base+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});
 const body=await r.json().catch(()=>null);
 return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
test('Certificate issuance requires admin-accepted Guru homework, PDF is private and revocable',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-certs-'));const p=await port(),base='http://127.0.0.1:'+p;
 const adminPassword='Test-Only-Admin-Certificates-2026';
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(p),NODE_ENV:'test',DATABASE_PATH:path.join(dir,'certs.sqlite'),SITE_ORIGIN:base,SESSION_SECRET:'local-certificates-test-session-secret-12345678',ADMIN_PASSWORD:adminPassword,PAYMENT_PROVIDER:'disabled'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',d=>errors+=d.toString());
 try{
  let ready=false;for(let i=0;i<70;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break}catch{}await new Promise(r=>setTimeout(r,100))}
  assert.ok(ready,'Server boot failed: '+errors);
  const st=await request(base,'/api/auth/register',{method:'POST',data:{name:'Олена Example',email:'cert-student@example.test',password:'LongCertifiedPassword#2026'}});assert.equal(st.status,200);
  const cookie=st.cookie,users=await request(base,'/api/me',{cookie});const uid=users.body.user.id;
  const stranger=await request(base,'/api/auth/register',{method:'POST',data:{name:'Other User',email:'stranger-cert@example.test',password:'OtherPassword#2026Long'}});
  const admin=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:adminPassword}});assert.equal(admin.status,200);
  const staff=admin.cookie;
  const grant=await request(base,'/api/admin/enroll',{method:'POST',cookie:staff,data:{user_id:uid,course_id:1,tier:'guru'}});assert.equal(grant.status,200);
  const lessons=(await request(base,'/api/lessons')).body.lessons;assert.equal(lessons.length,23);
  assert.equal((await request(base,'/api/admin/certificates/issue',{method:'POST',cookie,data:{user_id:uid,course_id:1}})).status,403);
  assert.equal((await request(base,'/api/admin/certificates/issue',{method:'POST',cookie:staff,data:{user_id:uid,course_id:1}})).status,409);
  assert.equal((await request(base,'/api/admin/homework/'+uid+'/1/approve',{method:'POST',cookie:staff,data:{approved:true}})).status,409);
  for(const lesson of lessons){
   const progress=await request(base,'/api/progress/'+lesson.id,{method:'POST',cookie,data:{completed:true,homework_url:'https://example.org/homework/'+lesson.id}});assert.equal(progress.status,200);
   const review=await request(base,'/api/admin/homework/'+uid+'/'+lesson.id+'/review',{method:'POST',cookie:staff,data:{feedback:'Approved technique '+lesson.id}});assert.equal(review.status,200);
   const approved=await request(base,'/api/admin/homework/'+uid+'/'+lesson.id+'/approve',{method:'POST',cookie:staff,data:{approved:true}});assert.equal(approved.status,200);
  }
  let current=await request(base,'/api/account/certificates',{cookie});
  assert.equal(current.status,200);assert.equal(current.body.certificates[0].approved,23);assert.equal(current.body.certificates[0].eligible,true);
  const revised=await request(base,'/api/progress/2',{method:'POST',cookie,data:{completed:true,homework_url:'https://example.org/new-submission'}});
  assert.equal(revised.status,200);
  current=await request(base,'/api/account/certificates',{cookie});
  assert.equal(current.body.certificates[0].approved,22,'Changing a submitted URL must revoke prior approval');
  assert.equal((await request(base,'/api/admin/certificates/issue',{method:'POST',cookie:staff,data:{user_id:uid,course_id:1}})).status,409);
  assert.equal((await request(base,'/api/admin/homework/'+uid+'/2/review',{method:'POST',cookie:staff,data:{feedback:'Accepted revised submission'}})).status,200);
  assert.equal((await request(base,'/api/admin/homework/'+uid+'/2/approve',{method:'POST',cookie:staff,data:{approved:true}})).status,200);
  const issue=await request(base,'/api/admin/certificates/issue',{method:'POST',cookie:staff,data:{user_id:uid,course_id:1}});
  assert.equal(issue.status,201);const serial=issue.body.certificate.serial;assert.match(serial,/^[a-f0-9-]{36}$/);
  assert.equal((await request(base,'/api/admin/certificates/issue',{method:'POST',cookie:staff,data:{user_id:uid,course_id:1}})).status,409);
  const verify=await request(base,'/api/certificates/verify/'+serial);assert.equal(verify.status,200);assert.equal(verify.body.valid,true);assert.equal(verify.body.student_name,'Олена Example');
  const ownPDF=await fetch(base+'/api/certificates/'+serial+'/pdf',{headers:{Cookie:cookie}});
  assert.equal(ownPDF.status,200,errors);assert.match(ownPDF.headers.get('content-type'),/application\/pdf/);
  const pdf=Buffer.from(await ownPDF.arrayBuffer());assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000,'Must generate a real embedded-font PDF');
  const otherPDF=await fetch(base+'/api/certificates/'+serial+'/pdf',{headers:{Cookie:stranger.cookie}});
  assert.equal(otherPDF.status,403);
  assert.equal((await fetch(base+'/api/certificates/'+serial+'/pdf')).status,401);
  assert.equal((await request(base,'/api/admin/certificates/'+serial+'/revoke',{method:'POST',cookie,data:{reason:'Not valid'}})).status,403);
  assert.equal((await request(base,'/api/admin/certificates/'+serial+'/revoke',{method:'POST',cookie:staff,data:{reason:'Duplicate enrollment evidence'}})).status,200);
  assert.equal((await request(base,'/api/certificates/verify/'+serial)).body.valid,false);
  assert.equal((await fetch(base+'/api/certificates/'+serial+'/pdf',{headers:{Cookie:cookie}})).status,410);
 }finally{child.kill('SIGTERM');await rm(dir,{recursive:true,force:true})}
},{timeout:40000});
