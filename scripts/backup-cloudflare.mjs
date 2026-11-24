#!/usr/bin/env node
/**
 * Owner-run portable SQL + Cloudflare KV media backup.
 * Works only with an administrator session and re-confirmed password.
 * All downloaded private data is encrypted BEFORE writing to disk.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {writeEncryptedBackup,verifyEncryptedBackup} from '../lib/backup-archive.js';

async function hidden(prompt){
 if(!process.stdin.isTTY)throw Error('Run this command in a private interactive terminal');
 return new Promise((resolve,reject)=>{
  const stdin=process.stdin,out=process.stderr;
  let text='',done=false;
  const original=stdin.isRaw;
  out.write(prompt);
  const finish=(error)=>{
   if(done)return;done=true;
   stdin.off('data',read);
   stdin.setRawMode(original);stdin.pause();out.write('\n');
   if(error)reject(error);else resolve(text);
  };
  const read=chunk=>{
   for(const c of chunk.toString('utf8')){
    if(c==='\u0003'){finish(Error('Cancelled'));return}
    if(c==='\r'||c==='\n'){finish();return}
    if(c==='\x7f'||c==='\b'){text=text.slice(0,-1);continue}
    if(c>=' '&&text.length<512)text+=c;
   }
  };
  stdin.setRawMode(true);stdin.resume();stdin.on('data',read);
 });
}
const fail=message=>{throw Error(message)};
const originArg=process.argv[2],outputArg=process.argv[3];
if(!originArg||!outputArg){
 console.error('Usage: npm run backup:cloudflare -- https://<your-worker-host> ./backups/legwork-YYYY-MM-DD.legwork-backup');
 process.exitCode=1;
}else{
 let token=null,cookie=null,origin=null,output=null;
 const request=async(relative,{method='GET',data,binary=false,backupToken=true}={})=>{
  const headers={'Accept':binary?'image/webp':'application/json','Origin':origin,
   ...(cookie?{'Cookie':cookie}:{}),...(backupToken&&token?{'X-Legwork-Backup-Token':token}:{}),
   ...(data?{'Content-Type':'application/json'}:{})};
  const response=await fetch(origin+relative,{method,headers,
   body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)fail('LEGWORK export request failed (HTTP '+response.status+', '+relative.split('?')[0]+')');
  if(binary)return response;
  return {data:await response.json(),response};
 };
 const fingerprint=m=>JSON.stringify({tables:m.tables.map(t=>[t.name,t.rows,t.sql]),
  indexes:m.indexes,images:m.images.map(i=>[i.name,i.bytes,i.uploaded_at])});
 try{
  const url=new URL(originArg);
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||url.username||url.password)
   fail('Use an exact HTTPS Worker origin with no path, credentials or query');
  origin=url.origin;output=path.resolve(outputArg);
  await fs.mkdir(path.dirname(output),{recursive:true,mode:0o700});
  try{await fs.access(output);fail('Backup already exists; choose a new filename')}catch(error){
   if(error.code!=='ENOENT')throw error;
  }
  const adminPassword=await hidden('LEGWORK admin password (not displayed): ');
  const one=await hidden('Backup encryption passphrase (16+ characters): ');
  const two=await hidden('Confirm encryption passphrase: ');
  if(one!==two||one.length<16)fail('Passphrases do not match or are too short');
  const adminCode=await hidden('Admin authenticator or recovery code (blank if MFA is off): ');
  const signin=await request('/api/auth/login',{method:'POST',data:{email:'admin',password:adminPassword,otp:adminCode},backupToken:false});
  cookie=signin.response.headers.get('set-cookie')?.match(/legwork_session=[a-f0-9]{64}/)?.[0];
  if(!cookie||signin.data?.user?.role!=='admin')fail('Admin session not established');
  const prepared=await request('/api/admin/backup/start',{method:'POST',data:{password:adminPassword},backupToken:false});
  token=prepared.data.token;
  if(!/^[a-f0-9]{64}$/.test(token||''))fail('Server did not issue a short-lived backup token');
  const {data:manifest}=await request('/api/admin/backup/manifest');
  if(manifest.format!=='LEGWORK-PORTABLE-1')fail('Unsupported backup protocol');
  async function* chunks(){
   yield {type:'manifest',data:manifest};
   for(const table of manifest.tables){
    for(let offset=0;offset<table.rows;offset+=100){
     const page=(await request('/api/admin/backup/table/'+encodeURIComponent(table.name)+'?offset='+offset+'&limit=100')).data;
     const wanted=Math.min(100,table.rows-offset);
     if(page.table!==table.name||page.offset!==offset||page.rows.length!==wanted)fail('Table changed during backup: '+table.name);
     yield {type:'table',name:table.name,offset,rows:page.rows};
    }
   }
   for(const item of manifest.images){
    const response=await request('/api/admin/backup/media/'+encodeURIComponent(item.name),{binary:true});
    const data=Buffer.from(await response.arrayBuffer());
    const sha=crypto.createHash('sha256').update(data).digest('hex');
    if(data.length!==item.bytes||sha!==response.headers.get('x-legwork-sha256'))fail('Image changed during export: '+item.name);
    yield {type:'image',name:item.name,data_base64:data.toString('base64'),sha256:sha};
   }
   const ending=(await request('/api/admin/backup/manifest')).data;
   if(fingerprint(ending)!==fingerprint(manifest))fail('Database records or images changed during export; retry in a maintenance window');
   yield {type:'finished'};
  }
  await writeEncryptedBackup(output,one,chunks());
  const check=await verifyEncryptedBackup(output,one);
  console.log('Encrypted backup verified locally:',check.tables,'tables,',check.rows,'rows,',check.images,'images.');
  console.log('Saved to',output);
  console.log('Copy it to access-controlled storage outside Cloudflare. This is not an automatic recurring backup.');
  console.log('This read-only export is not a transactionally consistent snapshot during concurrent writes.');
 }catch(error){
  if(output)await fs.rm(output,{force:true}).catch(()=>{});
  console.error('Backup failed:',error.message);
  process.exitCode=1;
 }finally{
  if(token&&origin){
   try{await request('/api/admin/backup/finish',{method:'POST',data:{}})}catch{}
  }
 }
}
