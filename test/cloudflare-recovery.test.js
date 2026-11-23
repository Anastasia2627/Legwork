import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import {hashPassword,verifyPassword} from '../lib/security.js';
import {registerCloudflareRecoveryRoutes} from '../cloudflare/recovery.js';

async function withApp(fn){
 const db=new Database(':memory:');
 db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT,password_hash TEXT)");
 db.prepare("INSERT INTO users(id,role,password_hash) VALUES(1,'admin',?)").run(hashPassword('secure-admin-password-2026'));
 const storage={getCurrentBookmark:async()=> '0000007b-0000b26e-00001538-0c3e87bb37b3db5cc52eedb93cd3b96b'};
 const app=express();app.use(express.json());const auth=(req,res,next)=>{
  const who=req.get('x-test-role');if(!who)return res.status(401).json({error:'Log in'});
  req.user={id:who==='admin'?1:2,role:who};next();
 };
 const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Forbidden'});
 registerCloudflareRecoveryRoutes(app,db,{auth,admin,ctx:{storage},verifyPassword});
 const server=app.listen(0,'127.0.0.1');
 try{await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const api=async(path,{role='admin',method='GET',data}={})=>{
   const response=await fetch(base+path,{method,headers:{...(role?{'x-test-role':role}:{}),...(data?{'Content-Type':'application/json'}:{})},
    body:data?JSON.stringify(data):undefined});
   return {status:response.status,json:await response.json().catch(()=>({})),headers:response.headers};
  };
  await fn({api,db,storage});
 }finally{await new Promise(resolve=>server.close(resolve));db.close()}
}

test('PITR checkpoints are private and demand administrator password',async()=>{
 await withApp(async({api})=>{
  const path='/api/admin/recovery/checkpoints';
  assert.equal((await api('/api/admin/recovery',{role:''})).status,401);
  assert.equal((await api('/api/admin/recovery',{role:'student'})).status,403);
  assert.equal((await api(path,{role:'student',method:'POST',data:{label:'Before release',password:'secure-admin-password-2026'}})).status,403);
  assert.equal((await api(path,{method:'POST',data:{label:'Before release',password:'wrong-password'}})).status,403);
  assert.equal((await api(path,{method:'POST',data:{label:'!',password:'secure-admin-password-2026'}})).status,400);
  const result=await api(path,{method:'POST',data:{label:'Before release',password:'secure-admin-password-2026'}});
  assert.equal(result.status,201);
  assert.ok(result.json.checkpoint.id>0);
  assert.equal(result.headers.get('cache-control'),'private, no-store');
  const listed=await api('/api/admin/recovery');
  assert.equal(listed.status,200);
  assert.equal(listed.json.supported,true);
  assert.equal(listed.json.restore_available_in_ui,false);
  assert.equal(listed.json.checkpoints.length,1);
  assert.equal('bookmark' in listed.json.checkpoints[0],false,'Raw bookmark must not appear in list');
  assert.equal((await api('/api/admin/recovery/checkpoints/1/reveal',{method:'POST',data:{password:'wrong'}})).status,403);
  const revealed=await api('/api/admin/recovery/checkpoints/1/reveal',{method:'POST',data:{password:'secure-admin-password-2026'}});
  assert.equal(revealed.status,200);
  assert.match(revealed.json.checkpoint.bookmark,/^0000007b/);
  assert.equal((await api('/api/admin/recovery/restore',{method:'POST',data:{}})).status,404,'No dangerous public restore endpoint');
 });
});
test('PITR checkpoint creation fails closed when Cloudflare cannot supply a bookmark',async()=>{
 await withApp(async({api,storage})=>{
  storage.getCurrentBookmark=async()=>{throw Error('PITR unsupported by local runtime')};
  const result=await api('/api/admin/recovery/checkpoints',{method:'POST',data:{label:'Before migration',password:'secure-admin-password-2026'}});
  assert.equal(result.status,503);
  assert.equal((await api('/api/admin/recovery')).json.checkpoints.length,0);
 });
});
