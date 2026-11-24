import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {once} from 'node:events';
import {finished} from 'node:stream/promises';
import {createGzip,createGunzip} from 'node:zlib';
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
 const tmp=target+'.tmp';
 const gzip=createGzip({level:6}),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 let file;
 try{
  file=fs.createWriteStream(tmp,{flags:'wx',mode:0o600});
  file.write(Buffer.concat([MAGIC,salt,iv]));
  gzip.pipe(cipher).pipe(file,{end:false});
  for await(const record of records){
   const line=JSON.stringify(record)+'\n';
   if(!gzip.write(line))await once(gzip,'drain');
  }
  gzip.end();
  await finished(cipher);
  const tag=cipher.getAuthTag();
  file.end(tag);
  await finished(file);
  await fsp.link(tmp,target); // Atomic no-overwrite save on the same filesystem.
  await fsp.unlink(tmp);
 }catch(error){
  gzip.destroy();cipher.destroy();file?.destroy();
  await fsp.rm(tmp,{force:true});
  throw error;
 }finally{key.fill(0)}
}

export async function verifyEncryptedBackup(target,passphrase){
 ensurePassphrase(passphrase);
 const stat=await fsp.stat(target);
 if(stat.size<HEADER+TAG+20)throw Error('Backup archive truncated');
 const header=Buffer.alloc(HEADER),tag=Buffer.alloc(TAG);
 const fd=await fsp.open(target,'r');
 try{
  await fd.read(header,0,HEADER,0);
  await fd.read(tag,0,TAG,stat.size-TAG);
 }finally{await fd.close()}
 if(!header.subarray(0,MAGIC.length).equals(MAGIC))throw Error('Not a LEGWORK encrypted backup');
 const salt=header.subarray(MAGIC.length,MAGIC.length+SALT),iv=header.subarray(MAGIC.length+SALT);
 const key=derive(passphrase,salt);
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
 decipher.setAuthTag(tag);
 const source=fs.createReadStream(target,{start:HEADER,end:stat.size-TAG-1});
 const gzip=createGunzip(),stream=source.pipe(decipher).pipe(gzip);
 // Node pipe() does not propagate upstream errors by itself. A failed GCM
 // authentication MUST fail the verification rather than return partial data.
 source.on('error',err=>gzip.destroy(err));
 decipher.on('error',err=>gzip.destroy(err));
 const lineReader=readline.createInterface({input:stream,crlfDelay:Infinity});
 const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'legwork-backup-check-'));
 let db,manifest,finishedRecord=false,rows=0,images=0;
 const seenTables=new Map(),seenImages=new Set();
 try{
  db=new Database(path.join(directory,'staging-recovery.sqlite'));
  db.pragma('foreign_keys=OFF');
  await fsp.mkdir(path.join(directory,'images'),{mode:0o700});
  for await(const line of lineReader){
   let item;
   try{item=JSON.parse(line)}catch{throw Error('Backup has a malformed JSON record')}
   if(!manifest){
    if(item.type!=='manifest'||item.data?.format!=='LEGWORK-PORTABLE-1')throw Error('Invalid backup manifest');
    manifest=item.data;
    for(const table of manifest.tables){
     if(!/^[A-Za-z_][A-Za-z0-9_]{0,90}$/.test(table.name)||!table.sql?.startsWith('CREATE TABLE'))throw Error('Unsafe table in backup');
     db.exec(table.sql);
     seenTables.set(table.name,0);
    }
    continue;
   }
   if(finishedRecord)throw Error('Records after backup completion marker');
   if(item.type==='table'){
    if(!seenTables.has(item.name)||!Array.isArray(item.rows))throw Error('Unexpected table data');
    if(!Number.isSafeInteger(item.offset)||item.offset!==seenTables.get(item.name))throw Error('Missing or reordered table page');
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
   db.exec(index.sql);
  }
  const integrity=db.pragma('integrity_check');
  if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw Error('Restored SQL failed integrity_check');
  const foreign=db.pragma('foreign_key_check');
  if(foreign.length)throw Error('Restored SQL failed foreign_key_check');
  return {verified:true,tables:manifest.tables.length,rows,images,exported_at:manifest.exported_at,
   warning:'Verified offline in disposable SQLite; not yet restored to a production Cloudflare Durable Object.'};
 }finally{
  lineReader.close();source.destroy();decipher.destroy();gzip.destroy();
  db?.close();key.fill(0);
  await fsp.rm(directory,{recursive:true,force:true});
 }
}
