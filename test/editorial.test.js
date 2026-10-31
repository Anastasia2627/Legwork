import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

const randomPort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
async function request(base,route,{method='GET',cookie,data}={}){
 const response=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 const body=await response.json().catch(()=>null);return {status:response.status,body,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function launch(dbFile){
 const port=await randomPort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'test',SITE_ORIGIN:base,DATABASE_PATH:dbFile,ADMIN_PASSWORD:'Editorial-Test-Admin-Passphrase-2026',PAYMENT_PROVIDER:'disabled'},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',b=>stderr+=b.toString());
 let ready=false;
 for(let i=0;i<70;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break}catch{}await new Promise(r=>setTimeout(r,90))}
 assert.ok(ready,'Server boot failed: '+stderr);
 return {base,child};
}
test('Bilingual editorial CMS: permissions, revisions, safety and persisted content',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-content-')),dbFile=path.join(dir,'content.sqlite');
 let running;
 try{
  running=await launch(dbFile);let {base}=running;
  let published=await request(base,'/api/content');
  assert.equal(published.status,200);
  assert.equal(published.body.pages.home.en.headlineTop,'MOVE LIKE');
  assert.equal(published.body.pages.home.es.headlineTop,'MUÉVETE COMO');
  assert.equal(published.body.pages.course.en.cta,"I'M READY");
  const anonymous=await request(base,'/api/admin/content');
  assert.equal(anonymous.status,401);
  const registration=await request(base,'/api/auth/register',{method:'POST',data:{email:'reader@example.org',name:'Student',password:'LongSchoolPassword#2088'}});
  assert.equal(registration.status,200);
  const editor=await request(base,'/api/auth/login',{method:'POST',data:{email:'Admin',password:'Editorial-Test-Admin-Passphrase-2026'}});
  assert.equal(editor.status,200);
  const adminCookie=editor.cookie,editorData=await request(base,'/api/admin/content',{cookie:adminCookie});
  assert.equal(editorData.status,200);
  assert.equal(editorData.body.revisions['home:en'],0);
  const original=editorData.body.content.home.en;
  const changed={...original,headlineTop:'DANCE BOLDLY',headlineAccent:'OWN THE FLOOR.',intro:'Learn thoughtfully & practice with purpose.',metaTitle:'Legwork School — Classes'};
  const url='/api/admin/content/home/en';
  assert.equal((await request(base,url,{method:'PUT',data:{values:changed,expected_revision:0}})).status,401);
  assert.equal((await request(base,url,{method:'PUT',cookie:registration.cookie,data:{values:changed,expected_revision:0}})).status,403);
  assert.equal((await request(base,url,{method:'PUT',cookie:adminCookie,data:{values:{...changed,intro:'<img src=x onerror=alert(1)>'},expected_revision:0}})).status,400);
  assert.equal((await request(base,url,{method:'PUT',cookie:adminCookie,data:{values:{...changed,randomJS:'alert(1)'},expected_revision:0}})).status,400);
  assert.equal((await request(base,url,{method:'PUT',cookie:adminCookie,data:{values:{...changed,cta:'A'.repeat(70)},expected_revision:0}})).status,400);
  const saved=await request(base,url,{method:'PUT',cookie:adminCookie,data:{values:changed,expected_revision:0}});
  assert.equal(saved.status,200);assert.equal(saved.body.revision,1);
  assert.equal((await request(base,url,{method:'PUT',cookie:adminCookie,data:{values:changed,expected_revision:0}})).status,409,'Concurrent editing must not silently overwrite');
  const verify=await request(base,'/api/content');assert.equal(verify.body.pages.home.en.headlineTop,'DANCE BOLDLY');
  assert.equal(verify.body.pages.home.es.headlineTop,'MUÉVETE COMO','Editing EN must not change ES');
  assert.equal(verify.body.pages.home.en.intro,'Learn thoughtfully & practice with purpose.');
  const esValues={...editorData.body.content.home.es,headlineTop:'BAILA A TU MANERA'};
  assert.equal((await request(base,'/api/admin/content/home/es',{method:'PUT',cookie:adminCookie,data:{values:esValues,expected_revision:0}})).status,200);
  assert.equal((await request(base,'/api/admin/content/unknown/en',{method:'PUT',cookie:adminCookie,data:{values:changed,expected_revision:0}})).status,404);
  running.child.kill('SIGTERM');running=null;await new Promise(r=>setTimeout(r,150));
  running=await launch(dbFile);base=running.base;
  published=await request(base,'/api/content');
  assert.equal(published.body.pages.home.en.headlineTop,'DANCE BOLDLY','Edited content must persist on disk');
  assert.equal(published.body.pages.home.es.headlineTop,'BAILA A TU MANERA');
  assert.equal(published.body.pages.mentorship.en.cta,'GET MENTORSHIP');
 }finally{running?.child.kill('SIGTERM');await rm(dir,{recursive:true,force:true})}
},{timeout:30000});
