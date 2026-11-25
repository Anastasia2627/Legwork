import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {writeEncryptedBackup,verifyEncryptedBackup} from '../lib/backup-archive.js';

test('Encrypted archive verifies after restoring rows into a disposable SQLite database',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'legwork-archive-test-'));
 const archive=path.join(folder,'sample.legwork-backup');
 const passphrase='very-long-secret-backup-test-passphrase';
 const data={format:'LEGWORK-PORTABLE-1',exported_at:'2026-11-24T00:00:00Z',
  tables:[{name:'users',sql:'CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE)',rows:1}],
  indexes:[],images:[],total_rows:1,total_image_bytes:0};
 async function* content(){yield {type:'manifest',data};yield {type:'table',name:'users',offset:0,rows:[{id:1,email:'sample@example.org'}]};yield {type:'finished'};}
 try{
  await writeEncryptedBackup(archive,passphrase,content());
  const bytes=await fs.readFile(archive);
  assert.equal(bytes.includes(Buffer.from('sample@example.org')),false);
  const verified=await verifyEncryptedBackup(archive,passphrase);
  assert.equal(verified.verified,true);assert.equal(verified.rows,1);
  await assert.rejects(verifyEncryptedBackup(archive,'wrong-passphrase-but-long'),/auth|decrypt|incorrect|unsupported|bad/i);
  bytes[bytes.length-10]^=0xff;
  await fs.writeFile(archive,bytes);
  await assert.rejects(verifyEncryptedBackup(archive,passphrase),/auth|decrypt|incorrect|unsupported|bad/i);
 }finally{await fs.rm(folder,{recursive:true,force:true})}
});

const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
test('Concurrent archives never overwrite or delete a different backup',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'legwork-archive-race-'));
 const target=path.join(folder,'one.legwork-backup'),pass='strong-archive-test-passphrase';
 async function* records(){
  yield {type:'manifest',data:{format:'LEGWORK-PORTABLE-1',tables:[],indexes:[],images:[],total_rows:0,total_image_bytes:0}};
  yield {type:'finished'};
 }
 try{
  const results=await Promise.allSettled([writeEncryptedBackup(target,pass,records()),writeEncryptedBackup(target,pass,records())]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  assert.equal((await verifyEncryptedBackup(target,pass)).verified,true);
  const saved=await fs.readFile(target);
  async function* broken(){yield {type:'manifest'};throw Error('simulated interrupted export');}
  await assert.rejects(writeEncryptedBackup(target,pass,broken()),/interrupted/);
  assert.deepEqual(await fs.readFile(target),saved);
  assert.deepEqual(await fs.readdir(folder),['one.legwork-backup']);
 }finally{await fs.rm(folder,{recursive:true,force:true})}
});

test('Restore verification validates private attachment hashes and page digests',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'legwork-private-backup-test-'));
 const pass='strong-private-backup-passphrase';
 const raw=Buffer.from('%PDF-1.4\nPrivate student document\n%%EOF');
 const schema='CREATE TABLE private_learning_files(id INTEGER PRIMARY KEY,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,base64_data TEXT NOT NULL)';
 const row={id:1,bytes:raw.length,sha256:sha(raw),base64_data:raw.toString('base64')};
 const manifest={format:'LEGWORK-PORTABLE-1',tables:[{name:'private_learning_files',sql:schema,rows:1}],indexes:[],images:[],total_rows:1,total_image_bytes:0};
 async function* records(file,digestOverride){
  const rows=[file];
  yield {type:'manifest',data:manifest};
  yield {type:'table',name:'private_learning_files',offset:0,rows,sha256:digestOverride??sha(JSON.stringify(rows))};
  yield {type:'finished'};
 }
 try{
  const ok=path.join(folder,'valid.legwork-backup');
  await writeEncryptedBackup(ok,pass,records(row));
  assert.equal((await verifyEncryptedBackup(ok,pass)).privateFiles,1);
  const bad=path.join(folder,'bad.legwork-backup');
  await writeEncryptedBackup(bad,pass,records({...row,base64_data:Buffer.from('wrong contents').toString('base64')}));
  await assert.rejects(verifyEncryptedBackup(bad,pass),/Private learning attachment checksum mismatch/);
  const page=path.join(folder,'bad-page.legwork-backup');
  await writeEncryptedBackup(page,pass,records(row,'0'.repeat(64)));
  await assert.rejects(verifyEncryptedBackup(page,pass),/Table page checksum mismatch/);
 }finally{await fs.rm(folder,{recursive:true,force:true})}
});
