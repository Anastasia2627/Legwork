import test from 'node:test';
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
