import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

const openPort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
const start=async({directory,indexing,mode})=>{
 const port=await openPort(),url='http://127.0.0.1:'+port;
 const env={...process.env,PORT:String(port),NODE_ENV:mode,ADMIN_PASSWORD:'Ephemeral-Testing-Only-Secret-456789',SESSION_SECRET:'legwork-temporary-test-secret-unique-2026-12345',DATABASE_PATH:path.join(directory,indexing?'indexed.sqlite':'unindexed.sqlite'),SITE_ORIGIN:mode==='production'?'https://legwork.example':url,PUBLIC_INDEXING_ENABLED:indexing?'true':'false',PAYMENT_PROVIDER:'disabled',SMTP_HOST:'',SMTP_FROM:''};
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
