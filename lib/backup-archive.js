import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip,gunzipSync} from 'node:zlib';
import Database from 'better-sqlite3';

const MAGIC=Buffer.from('LEGWORK1');
const SALT=16,IV=12,TAG=16,HEADER=MAGIC.length+SALT+IV;
const IMAGE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const derive=(pass,salt)=>crypto.scryptSync(pass,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
const ensurePassphrase=s=>{if(typeof s!=='string'||s.length<16)throw Error('Use an archive passphrase of 16+ characters')};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

export async function writeEncryptedBackup(target,passphrase,records){
 ensurePassphrase(passphrase);
 const salt=crypto.randomBytes(SALT),iv=crypto.randomBytes(IV),key=derive(passphrase,salt);
 // Unique private work directory prevents concurrent exports from deleting
 // another process's partial archive. Only ciphertext ever touches disk.
 let work;
 try{
  work=await fsp.mkdtemp(path.join(path.dirname(target),'.legwork-backup-'));
  const tmp=path.join(work,'archive');
  await fsp.writeFile(tmp,Buffer.concat([MAGIC,salt,iv]),{flag:'wx',mode:0o600});
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  async function* lines(){for await(const record of records)yield Buffer.from(JSON.stringify(record)+'\n');}
  await pipeline(Readable.from(lines()),createGzip({level:6}),cipher,fs.createWriteStream(tmp,{flags:'a'}));
  await fsp.appendFile(tmp,cipher.getAuthTag());
  const handle=await fsp.open(tmp,'r+');
  try{await handle.sync();}finally{await handle.close();}
  await fsp.link(tmp,target); // Atomic no-overwrite save on the same filesystem.
 }finally{
  key.fill(0);
  if(work)await fsp.rm(work,{recursive:true,force:true});
 }
}

export async function verifyEncryptedBackup(target,passphrase){
 ensurePassphrase(passphrase);
 // A manual owner-operated verifier may hold the archive in memory, but never
 // allocates unbounded memory when handed an untrusted or malformed archive.
 const stat=await fsp.stat(target);
 const maxArchive=256*1024*1024;
 if(stat.size<HEADER+TAG+20||stat.size>maxArchive)
  throw Error('Backup archive truncated or exceeds 256 MiB verification limit');
 const archive=await fsp.readFile(target);
 if(!archive.subarray(0,MAGIC.length).equals(MAGIC))throw Error('Not a LEGWORK encrypted backup');
 const salt=archive.subarray(MAGIC.length,MAGIC.length+SALT);
 const iv=archive.subarray(MAGIC.length+SALT,HEADER);
 const tag=archive.subarray(archive.length-TAG);
 const payload=archive.subarray(HEADER,archive.length-TAG);
 const key=derive(passphrase,salt);
 let plaintext;
 try{
  // IMPORTANT: verify the GCM authentication tag BEFORE parsing or writing
  // ANY plaintext. This avoids asynchronous decipher stream errors and
  // processing unauthenticated rows on a wrong password or tampered archive.
  const cipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
  cipher.setAuthTag(tag);
  const compressed=Buffer.concat([cipher.update(payload),cipher.final()]);
  plaintext=gunzipSync(compressed,{maxOutputLength:384*1024*1024}).toString('utf8');
 }catch{
  throw Error('Backup authentication or decompression failed');
 }finally{key.fill(0)}
 const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'legwork-backup-check-'));
 let db,manifest,finishedRecord=false,rows=0,images=0;
 const seenTables=new Map(),seenImages=new Set();
 try{
  db=new Database(path.join(directory,'staging-recovery.sqlite'));
  db.pragma('foreign_keys=OFF');
  await fsp.mkdir(path.join(directory,'images'),{mode:0o700});
  for(const line of plaintext.split('\n')){
   if(!line)continue;
   let item;
   try{item=JSON.parse(line)}catch{throw Error('Backup has a malformed JSON record')}
   if(!manifest){
    if(item.type!=='manifest'||item.data?.format!=='LEGWORK-PORTABLE-1')throw Error('Invalid backup manifest');
    manifest=item.data;
    for(const table of manifest.tables){
     if(!/^[A-Za-z_][A-Za-z0-9_]{0,90}$/.test(table.name)||!table.sql?.startsWith('CREATE TABLE'))throw Error('Unsafe table in backup');
     if(seenTables.has(table.name))throw Error('Duplicate table in backup');
     db.prepare(table.sql).run();
     if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table.name))throw Error('Table schema name mismatch');
     seenTables.set(table.name,0);
    }
    continue;
   }
   if(finishedRecord)throw Error('Records after backup completion marker');
   if(item.type==='table'){
    if(!seenTables.has(item.name)||!Array.isArray(item.rows))throw Error('Unexpected table data');
    if(!Number.isSafeInteger(item.offset)||item.offset!==seenTables.get(item.name))throw Error('Missing or reordered table page');
    if(item.sha256!==undefined&&item.sha256!==digest(JSON.stringify(item.rows)))throw Error('Table page checksum mismatch');
    for(const row of item.rows){
     const columns=Object.keys(row);
     if(!columns.length)throw Error('Empty backup row');
     const values=columns.map(c=>{
      const v=row[c];
      return v&&typeof v==='object'&&Object.hasOwn(v,'_legwork_binary_base64')?Buffer.from(v._legwork_binary_base64,'base64'):v;
     });
     const statement='INSERT INTO '+quote(item.name)+' ('+columns.map(quote).join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')';
     db.prepare(statement).run(...values);
     rows++;
    }
    seenTables.set(item.name,item.offset+item.rows.length);
   }else if(item.type==='image'){
    const stored=manifest.images.find(image=>image.name===item.name);
    if(!stored||!IMAGE.test(item.name)||seenImages.has(item.name))throw Error('Unexpected image in backup');
    const data=Buffer.from(item.data_base64,'base64');
    if(data.length!==stored.bytes||digest(data)!==item.sha256)throw Error('Image checksum mismatch');
    await fsp.writeFile(path.join(directory,'images',item.name),data,{flag:'wx',mode:0o600});
    seenImages.add(item.name);images++;
   }else if(item.type==='finished'){
    finishedRecord=true;
   }else throw Error('Unknown backup record');
  }
  if(!finishedRecord)throw Error('Missing backup completion marker');
  for(const t of manifest.tables)if(seenTables.get(t.name)!==t.rows)throw Error('Table row counts do not match backup manifest');
  if(manifest.images.length!==seenImages.size||rows!==manifest.total_rows)throw Error('Backup object counts do not match manifest');
  for(const index of manifest.indexes||[]){
   if(!['index','trigger','view'].includes(index.type)||typeof index.sql!=='string')throw Error('Unsafe index metadata');
   const pattern={index:/^CREATE\s+(?:UNIQUE\s+)?INDEX\s/i,trigger:/^CREATE\s+TRIGGER\s/i,view:/^CREATE\s+VIEW\s/i}[index.type];
   if(!pattern.test(index.sql))throw Error('Unexpected schema statement');
   db.prepare(index.sql).run();
  }
  // Validate private lesson attachments as well as public WebP assets.
  const exists=name=>seenTables.has(name);
  let privateFiles=0;
  if(exists('private_learning_files')){
   for(const row of db.prepare('SELECT id,bytes,sha256,base64_data FROM private_learning_files').iterate()){
    const bytes=Buffer.from(row.base64_data,'base64');
    if(bytes.length!==row.bytes||digest(bytes)!==row.sha256)throw Error('Private learning attachment checksum mismatch');
    privateFiles++;
   }
  }
  if(exists('uploaded_images')){
   const entries=db.prepare('SELECT name,bytes FROM uploaded_images').all();
   if(entries.length!==manifest.images.length||entries.some(row=>!manifest.images.some(image=>image.name===row.name&&image.bytes===row.bytes)))throw Error('Public image registry does not match backup manifest');
  }
  for(const [table,column] of [['site_media','url'],['lessons','cover_url']]){
   if(!exists(table))continue;
   for(const row of db.prepare('SELECT '+quote(column)+' AS url FROM '+quote(table)+" WHERE "+quote(column)+" LIKE '/media/%'").iterate()){
    if(!seenImages.has(row.url.slice('/media/'.length)))throw Error('Referenced public media missing from backup');
   }
  }
  const integrity=db.pragma('integrity_check');
  if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw Error('Restored SQL failed integrity_check');
  const foreign=db.pragma('foreign_key_check');
  if(foreign.length)throw Error('Restored SQL failed foreign_key_check');
  return {verified:true,tables:manifest.tables.length,rows,images,privateFiles,exported_at:manifest.exported_at,
   warning:'Verified offline in disposable SQLite; not yet restored to a production Cloudflare Durable Object.'};
 }finally{
  db?.close();plaintext=null;
  await fsp.rm(directory,{recursive:true,force:true});
 }
}
