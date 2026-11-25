import test from 'node:test';
import assert from 'node:assert/strict';
import {probeSchool} from '../scripts/production-health.mjs';

const records={
 '/health':{ok:true},
 '/api/courses':{courses:[{id:1,title:'Legwork Lab'}]},
 '/api/lessons':{lessons:[{id:1,free:true},{id:2,free:false}]},
 '/api/bundles':{bundles:[]},
 '/api/content':{pages:{home:{en:{headlineTop:'Svitlana'}}}},
 '/api/media':{assets:{}}
};
const json=(body,status=200)=>({
 status,ok:status>=200&&status<300,
 headers:{get:(name)=>name==='content-type'?'application/json':null},
 text:async()=>JSON.stringify(body)
});
const html=()=>({
 status:200,ok:true,headers:{get:(name)=>name==='content-type'?'text/html':null},
 text:async()=>'<title>LEGWORK Online School</title>'
});
function fakeFetch({overrides={},seen=[]}={}){
 return async(url,options)=>{
  const path=new URL(url).pathname; seen.push({path,options});
  if(overrides[path])return overrides[path];
  if(path==='/')return html();
  if(path==='/api/dashboard'||path==='/api/admin/overview'||path==='/api/lessons/2/watch')
   return json({error:'Sign in first'},401);
  if(records[path])return json(records[path]);
  return json({error:'Not found'},404);
 };
}

test('Read-only availability checks database, catalog, static HTML and access controls',async()=>{
 const seen=[];
 const result=await probeSchool('https://legwork.example/',{fetchImpl:fakeFetch({seen}),timeoutMs:500,delayMs:0});
 assert.equal(result.ok,true);
 assert.equal(result.checks.length,10);
 assert.deepEqual(seen.map(x=>x.path),[
  '/health','/','/api/courses','/api/lessons','/api/bundles','/api/content','/api/media',
  '/api/dashboard','/api/admin/overview','/api/lessons/2/watch'
 ]);
 assert.ok(seen.every(x=>x.options.method==='GET'&&x.options.redirect==='error'));
 assert.ok(seen.every(x=>!x.options.headers.Authorization&&!x.options.headers.Cookie));
 assert.ok(result.checks.every(x=>!('data' in x)),'No public data should be printed in monitor results');
});

test('Health failure is visible but never prints server details or secrets',async()=>{
 const fetchImpl=fakeFetch({overrides:{'/health':json({error:'LEGWORK initialization failed',secret:'must-not-appear'},503)}});
 const result=await probeSchool('https://legwork.example/',{fetchImpl,timeoutMs:50,delayMs:0});
 assert.equal(result.ok,false);
 assert.equal(result.checks[0].status,'failed');
 assert.match(result.checks[0].reason,/503/);
 assert.ok(!JSON.stringify(result).includes('must-not-appear'));
 assert.equal(result.checks.find(x=>x.path==='/').status,'ok');
});

test('Anonymous access and leaks of lesson video URLs fail closed',async()=>{
 const unsafe=fakeFetch({overrides:{
  '/api/dashboard':json({progress:[],account:{private:true}},200),
  '/api/lessons':json({lessons:[{id:2,free:false,video_url:'private-youtube-link'}]})
 }});
 const result=await probeSchool('https://legwork.example/',{fetchImpl:unsafe,timeoutMs:50,delayMs:0});
 assert.equal(result.ok,false);
 assert.match(result.checks.find(x=>x.path==='/api/dashboard').reason,/access unexpectedly allowed/);
 assert.match(result.checks.find(x=>x.path==='/api/lessons').reason,/private video field/);
 assert.ok(!JSON.stringify(result).includes('private-youtube-link'));
});

test('Missing catalog or malformed API response is a failure, invalid origins rejected',async()=>{
 const result=await probeSchool('https://legwork.example/',{fetchImpl:fakeFetch({
  overrides:{'/api/courses':json({courses:[]}),'/api/media':html()}
 }),timeoutMs:50,delayMs:0});
 assert.equal(result.ok,false);
 assert.match(result.checks.find(x=>x.path==='/api/courses').reason,/catalog empty/);
 assert.match(result.checks.find(x=>x.path==='/api/media').reason,/Expected JSON/);
 await assert.rejects(probeSchool('http://legwork.example',{}),/HTTPS/);
});
