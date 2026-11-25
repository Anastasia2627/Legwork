#!/usr/bin/env node
import path from 'node:path';
import {verifyEncryptedBackup} from '../lib/backup-archive.js';
async function hidden(prompt){
 if(!process.stdin.isTTY)throw Error('Interactive terminal required');
 return new Promise((resolve,reject)=>{
  const s=process.stdin,original=s.isRaw;
  let value='';
  process.stderr.write(prompt);
  const done=(err)=>{
   s.off('data',next);s.setRawMode(original);s.pause();process.stderr.write('\n');
   if(err)reject(err);else resolve(value);
  };
  const next=chunk=>{for(const c of chunk.toString('utf8')){
   if(c==='\u0003'){done(Error('Cancelled'));return}
   if(c==='\r'||c==='\n'){done();return}
   if(c==='\x7f'){value=value.slice(0,-1);continue}
   if(c>=' '&&value.length<512)value+=c;
  }};
  s.setRawMode(true);s.resume();s.on('data',next);
 });
}
try{
 if(!process.argv[2])throw Error('Usage: npm run backup:verify -- ./backups/name.legwork-backup');
 const passphrase=await hidden('Backup encryption passphrase: ');
 const result=await verifyEncryptedBackup(path.resolve(process.argv[2]),passphrase);
 console.log('VERIFIED offline:',result.tables,'tables,',result.rows,'rows,',result.images,'images,',result.privateFiles,'private attachments.');
 console.log('Temporary plaintext verification files were removed (not guaranteed securely erased).');
}catch(error){console.error('Backup verification failed:',error.message);process.exitCode=1}
