import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

const openPort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
const start=async({directory,indexing,mode,smtpEnabled=false,registrationFlag=false})=>{
 const port=await openPort(),url='http://127.0.0.1:'+port;
 const env={...process.env,PORT:String(port),NODE_ENV:mode,ADMIN_PASSWORD:'Ephemeral-Testing-Only-Secret-456789',SESSION_SECRET:'legwork-temporary-test-secret-unique-2026-12345',DATABASE_PATH:path.join(directory,indexing?'indexed.sqlite':'unindexed.sqlite'),SITE_ORIGIN:mode==='production'?'https://legwork.example':url,PUBLIC_INDEXING_ENABLED:indexing?'true':'false',PAYMENT_PROVIDER:'disabled',REGISTRATION_OPEN:registrationFlag?'true':'false',
  SMTP_HOST:smtpEnabled?'smtp.invalid':'',SMTP_FROM:smtpEnabled?'LEGWORK <school@example.org>':'',SMTP_PORT:smtpEnabled?'587':'',SMTP_USER:smtpEnabled?'unused-test-user':'',SMTP_PASSWORD:smtpEnabled?'unused-test-password':''};
 const child=spawn(process.execPath,['server.js'],{env,cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',chunk=>errors+=chunk.toString());
 let healthy=false;for(let i=0;i<80;i++){try{healthy=(await fetch(url+'/health')).ok;if(healthy)break}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.equal(healthy,true,'Server did not become ready: '+errors);
 return {url,child};
};
test('SEO is disabled before launch, with correct public pages and non-indexed private routes',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-seo-'));let service;
 try{
  service=await start({directory:dir,indexing:false,mode:'test'});
  const robots=await fetch(service.url+'/robots.txt');assert.equal(robots.status,200);assert.match(await robots.text(),/Disallow: \//);
  const sitemap=await fetch(service.url+'/sitemap.xml');assert.equal(sitemap.status,404);
  for(const page of ['/','/course','/shop','/mentorship']){
   const res=await fetch(service.url+page);assert.equal(res.status,200,page);
   const body=await res.text();assert.match(body,/<meta name="robots" content="noindex,nofollow"/);
   assert.match(body,/<link rel="canonical"/);
   assert.match(body,/<main id="app"/);
   assert.match(body,/<h1>/);
   assert.equal(res.headers.get('cache-control'),'no-store');
  }
  const rawIndex=await fetch(service.url+'/index.html');assert.equal(rawIndex.status,200);assert.match(rawIndex.headers.get('x-robots-tag')||'',/noindex/);
  const notFound=await fetch(service.url+'/forgot-route');assert.equal(notFound.status,404);
  assert.match(notFound.headers.get('x-robots-tag'),/noindex/);
  assert.equal((await fetch(service.url+'/health')).status,200);
 }finally{service?.child.kill('SIGTERM');await rm(dir,{recursive:true,force:true})}
},{timeout:30000});

test('Production opt-in sitemap contains only public pages and uses the configured HTTPS domain',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-index-'));let service;
 try{
  service=await start({directory:dir,indexing:true,mode:'production'});
  const sitemap=await fetch(service.url+'/sitemap.xml');
  assert.equal(sitemap.status,200);const xml=await sitemap.text();
  for(const route of ['/','/course','/shop','/mentorship'])assert.ok(xml.includes('<loc>https://legwork.example'+route+'</loc>'),route);
  assert.ok(!xml.includes('account'));assert.ok(!xml.includes('payment'));assert.ok(!xml.includes('study'));
  const robots=await fetch(service.url+'/robots.txt');assert.match(await robots.text(),/Sitemap: https:\/\/legwork\.example\/sitemap\.xml/);
  const catalog=await fetch(service.url+'/shop');const html=await catalog.text();
  assert.match(html,/<meta name="robots" content="index,follow"/);
  assert.match(html,/<title>Online Dance Classes &amp; Bundles \| Legwork<\/title>/);
  assert.match(html,/<meta property="og:url" content="https:\/\/legwork\.example\/shop"/);
 }finally{service?.child.kill('SIGTERM');await rm(dir,{recursive:true,force:true})}
},{timeout:30000});


test('Production registrations require a separate manual launch after email setup',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'legwork-register-release-'));
 const instances=[];
 try{
  // Even with mail SMTP variables, production must not open registration by accident.
  const configured=await start({directory:dir,indexing:false,mode:'production',smtpEnabled:true,registrationFlag:false});
  instances.push(configured);
  const config=await fetch(configured.url+'/api/email/config').then(r=>r.json());
  assert.equal(config.enabled,true);
  assert.equal(config.registration_open,false);
  const attempt=await fetch(configured.url+'/api/auth/register',{
   method:'POST',headers:{'Content-Type':'application/json',Origin:'https://legwork.example'},
   body:JSON.stringify({name:'Preview Student',email:'preview@example.org',password:'LongPassword-Preview-1234'})
  });
  assert.equal(attempt.status,503);
  assert.match((await attempt.json()).error,/not yet open/);

  // A launch flag without working mail must still fail closed.
  const noMail=await start({directory:dir,indexing:false,mode:'production',registrationFlag:true});
  instances.push(noMail);
  const config2=await fetch(noMail.url+'/api/email/config').then(r=>r.json());
  assert.equal(config2.enabled,false);
  assert.equal(config2.registration_open,false);
  const attempt2=await fetch(noMail.url+'/api/auth/register',{
   method:'POST',headers:{'Content-Type':'application/json',Origin:'https://legwork.example'},
   body:JSON.stringify({name:'Preview Student',email:'another@example.org',password:'LongPassword-Preview-1234'})
  });
  assert.equal(attempt2.status,503);
  // Existing administrator login must remain possible during the closed launch.
  const login=await fetch(noMail.url+'/api/auth/login',{
   method:'POST',headers:{'Content-Type':'application/json',Origin:'https://legwork.example'},
   body:JSON.stringify({email:'admin',password:'Ephemeral-Testing-Only-Secret-456789'})
  });
  assert.equal(login.status,200);
 }finally{
  for(const service of instances)service.child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:30000});
