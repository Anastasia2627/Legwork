import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {validLearningFile} from '../lib/private-learning.js';

const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const jpeg=Buffer.concat([Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1]),Buffer.alloc(60),Buffer.from([255,217])]);
const port=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
test('Signatures and size checks reject fake files',()=>{
 assert.equal(validLearningFile(pdf,'application/pdf'),true);
 assert.equal(validLearningFile(jpeg,'image/jpeg'),true);
 assert.equal(validLearningFile(Buffer.from('<script>alert(1)</script>'),'application/pdf'),false);
 assert.equal(validLearningFile(Buffer.alloc(1024*1024+1),'application/pdf'),false);
});
test('Private PDF and Guru attachments are gated, preserve progress and reset approvals',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-private-doc-'));
 const p=await port(),base='http://127.0.0.1:'+p,adminPassword='test-learning-private-admin-password-2026';
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,
  NODE_ENV:'test',PORT:String(p),SITE_ORIGIN:base,DATABASE_PATH:path.join(dir,'test.sqlite'),
  SESSION_SECRET:'very-long-private-learning-test-secret-2026',
  ADMIN_PASSWORD:adminPassword,PAYMENT_PROVIDER:'disabled'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',x=>errors+=x.toString());
 const call=async(url,{cookie,method='GET',body,raw,mime='application/pdf'}={})=>{
  const response=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),
   ...(raw?{'Content-Type':mime,Origin:base}:{}),...(body?{'Content-Type':'application/json',Origin:base}:{})},
   body:raw||(body?JSON.stringify(body):undefined)});
  return {status:response.status,body:response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer()),
   headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 try{
  let up=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok){up=true;break}}catch{}await new Promise(ok=>setTimeout(ok,90))}
  assert.equal(up,true,'server boot: '+errors);
  const a=await call('/api/auth/register',{method:'POST',body:{name:'Guru Alice',email:'guru-a@example.org',password:'PracticeStudentPassword2026'}});
  const b=await call('/api/auth/register',{method:'POST',body:{name:'Bob',email:'guru-b@example.org',password:'PracticeStudentPassword2027'}});
  const root=await call('/api/auth/login',{method:'POST',body:{email:'admin',password:adminPassword}});
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(root.status,200);
  const student=a.cookie,other=b.cookie,admin=root.cookie,uid=a.body.user.id;
  assert.equal((await call('/api/learning/2/materials')).status,401);
  assert.equal((await call('/api/learning/2/materials',{cookie:student})).status,403);
  assert.equal((await call('/api/admin/lessons/2/materials?title=Notes',{cookie:student,method:'POST',raw:pdf})).status,403);
  assert.equal((await call('/api/learning/2/homework-file',{cookie:student,method:'POST',raw:pdf})).status,403);
  assert.equal((await call('/api/admin/lessons/2/materials?title=Wrong',{cookie:admin,method:'POST',raw:Buffer.from('<html>not pdf</html>')})).status,422);
  const uploaded=await call('/api/admin/lessons/2/materials?title=Flexi%20Legs',{cookie:admin,method:'POST',raw:pdf});
  assert.equal(uploaded.status,201);
  const id=uploaded.body.material.id;
  assert.equal((await call('/api/learning/materials/'+id+'/download',{cookie:other})).status,403);
  assert.equal((await call('/api/admin/enroll',{cookie:admin,method:'POST',body:{user_id:uid,course_id:1,tier:'guru'}})).status,200);
  const list=await call('/api/learning/2/materials',{cookie:student});
  assert.equal(list.body.materials[0].title,'Flexi Legs');
  assert.equal(JSON.stringify(list.body).includes('base64_data'),false);
  const downloaded=await call('/api/learning/materials/'+id+'/download',{cookie:student});
  assert.equal(downloaded.status,200);
  assert.deepEqual(downloaded.body,pdf);
  assert.match(downloaded.headers.get('content-disposition'),/^attachment/);
  assert.equal(downloaded.headers.get('cache-control'),'private, no-store');
  const submit=await call('/api/learning/2/homework-file',{cookie:student,method:'POST',raw:jpeg,mime:'image/jpeg'});
  assert.equal(submit.status,201);
  const link='/api/learning/homework-files/'+uid+'/2/download';
  assert.equal(submit.body.homework_url,link);
  assert.equal((await call(link,{cookie:other})).status,403);
  assert.deepEqual((await call(link,{cookie:student})).body,jpeg);
  assert.equal((await call('/api/progress/2',{cookie:student,method:'POST',body:{completed:true,homework_url:link}})).status,200);
  const review=await call('/api/admin/homework/'+uid+'/2/review',{cookie:admin,method:'POST',body:{feedback:'Improve knee line'}});
  assert.equal(review.status,200);
  assert.equal((await call('/api/admin/homework/'+uid+'/2/approve',{cookie:admin,method:'POST',body:{approved:true}})).status,200);
  assert.equal((await call('/api/learning/2/homework-file',{cookie:student,method:'POST',raw:pdf})).status,201);
  const current=(await call('/api/admin/homework',{cookie:admin})).body.homework.find(x=>x.user_id===uid&&x.lesson_id===2);
  assert.equal(current.approved,0);
  assert.equal(current.feedback,null);
  assert.equal((await call('/api/progress/2',{cookie:student,method:'POST',body:{completed:true,homework_url:'https://example.org/practice'}})).status,200);
  assert.equal((await call(link,{cookie:student})).status,404);
  assert.equal((await call('/api/progress/2',{cookie:student,method:'POST',body:{completed:true,homework_url:'/api/learning/homework-files/999/2/download'}})).status,400);
  assert.equal((await call('/api/admin/materials/'+id,{cookie:student,method:'DELETE'})).status,403);
  assert.equal((await call('/api/admin/materials/'+id,{cookie:admin,method:'DELETE'})).status,200);
  assert.equal((await call('/api/learning/materials/'+id+'/download',{cookie:student})).status,404);
 }finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()});
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:30000});
