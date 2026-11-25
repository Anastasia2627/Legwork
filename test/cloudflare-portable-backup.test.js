import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import {hashPassword,verifyPassword} from '../lib/security.js';
import {registerCloudflareBackupRoutes} from '../cloudflare/portable-backup.js';

test('Protected paginated portable export includes SQL metadata and KV images, never backup tokens',async()=>{
 const db=new Database(':memory:');
 db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT,password_hash TEXT);"+
 "CREATE TABLE uploaded_images(name TEXT PRIMARY KEY,uploaded_at INTEGER,bytes INTEGER);"+
 "CREATE TABLE notes(id INTEGER PRIMARY KEY,label TEXT);"+
 "INSERT INTO notes VALUES(1,'example'),(2,'second');");
 db.prepare("INSERT INTO users VALUES(1,'admin',?)").run(hashPassword('super-secret-admin-pass'));
 const imageName='123e4567-e89b-42d3-a456-426614174000.webp',image=Buffer.from('RIFFfakeimagebytes');
 db.prepare('INSERT INTO uploaded_images VALUES(?,?,?)').run(imageName,Date.now(),image.length);
 const ctx={storage:{kv:{get:key=>key==='public-image:'+imageName?image.buffer.slice(image.byteOffset,image.byteOffset+image.byteLength):null}}};
 const app=express();app.use(express.json());
 const auth=(req,res,next)=>{if(!req.get('x-user'))return res.status(401).json({error:'No login'});req.user={id:req.get('x-user')==='admin'?1:2,role:req.get('x-user')};next()};
 const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Forbidden'});
 registerCloudflareBackupRoutes(app,db,{auth,admin,ctx,verifyPassword});
 const server=app.listen(0,'127.0.0.1');await new Promise(ok=>server.once('listening',ok));
 try{
  const root='http://127.0.0.1:'+server.address().port;
  const call=async(path,{user='admin',method='GET',token,body,session='a'.repeat(64)}={})=>{
   const response=await fetch(root+path,{method,headers:{...(user?{'x-user':user,Cookie:'legwork_session='+session}:{}),
    ...(token?{'X-Legwork-Backup-Token':token}:{}),...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined});
   return {response,json:response.headers.get('content-type')?.includes('json')?await response.json():null};
  };
  assert.equal((await call('/api/admin/backup',{user:''})).response.status,401);
  assert.equal((await call('/api/admin/backup',{user:'student'})).response.status,403);
  assert.equal((await call('/api/admin/backup/start',{method:'POST',user:'student',body:{password:'super-secret-admin-pass'}})).response.status,403);
  assert.equal((await call('/api/admin/backup/start',{method:'POST',body:{password:'wrong-pass'}})).response.status,403);
  const start=await call('/api/admin/backup/start',{method:'POST',body:{password:'super-secret-admin-pass'}});
  assert.equal(start.response.status,201);
  const token=start.json.token;
  assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal((await call('/api/admin/backup/manifest')).response.status,403);
  assert.equal((await call('/api/admin/backup/manifest',{token,session:'b'.repeat(64)})).response.status,403);
  const snapshot=await call('/api/admin/backup/manifest',{token});
  assert.equal(snapshot.response.status,200);
  assert.equal(snapshot.response.headers.get('cache-control'),'private, no-store');
  assert.equal(snapshot.json.format,'LEGWORK-PORTABLE-1');
  assert.equal(snapshot.json.tables.some(t=>t.name==='notes'&&t.rows===2),true);
  assert.equal(snapshot.json.tables.some(t=>t.name==='backup_access_sessions'),false);
  assert.equal(snapshot.json.images[0].name,imageName);
  const rows=await call('/api/admin/backup/table/notes?offset=0&limit=1',{token});
  assert.equal(rows.json.rows[0].label,'example');
  assert.equal(rows.json.next_offset,1);
  const digest=await call('/api/admin/backup/table/notes?offset=0&limit=1&digest=1',{token});
  assert.equal(digest.json.sha256,rows.json.sha256);
  assert.equal(digest.json.rows,undefined);
  db.prepare('UPDATE notes SET label=? WHERE id=1').run('changed');
  assert.notEqual((await call('/api/admin/backup/table/notes?offset=0&limit=1&digest=1',{token})).json.sha256,rows.json.sha256);
  assert.equal((await call('/api/admin/backup/table/sqlite_master?offset=0',{token})).response.status,404);
  assert.equal((await call('/api/admin/backup/table/notes?limit=300',{token})).response.status,400);
  const pic=await call('/api/admin/backup/media/'+imageName,{token});
  assert.equal(pic.response.status,200);
  assert.equal(pic.response.headers.get('x-legwork-sha256').length,64);
  assert.equal((await call('/api/admin/backup/finish',{method:'POST',token,body:{}})).response.status,200);
  assert.equal((await call('/api/admin/backup/manifest',{token})).response.status,403);
 }finally{await new Promise(ok=>server.close(ok));db.close()}
});
