import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

test('CLI refusing an existing backup must preserve the original archive byte-for-byte',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'legwork-cli-original-'));
 const target=path.join(directory,'previous.legwork-backup');
 const original=Buffer.from('Existing private owner backup -- preserve without changes.');
 await fs.writeFile(target,original,{mode:0o600});
 try{
  const source=fileURLToPath(new URL('../scripts/backup-cloudflare.mjs',import.meta.url));
  const child=spawn(process.execPath,[source,'https://legwork-school.example.workers.dev',target],{stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',part=>stderr+=part);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
  assert.notEqual(code,0);
  assert.match(stderr,/already exists/i);
  assert.deepEqual(await fs.readFile(target),original);
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
