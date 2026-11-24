import test from 'node:test';
import assert from 'node:assert/strict';
import {probeSchool} from '../scripts/production-health.mjs';
const headers=type=>({get:()=>type});
test('Public availability probe checks HTML and database without authentication',async()=>{
 const called=[];
 const fetchImpl=async(url)=>{called.push(url);return url.endsWith('/health')
  ?{ok:true,headers:headers('application/json'),json:async()=>({ok:true})}
  :{ok:true,headers:headers('text/html'),text:async()=>'<title>LEGWORK Online School</title>'}};
 const result=await probeSchool('https://legwork.example/',{fetchImpl,timeoutMs:500});
 assert.equal(result.ok,true);
 assert.deepEqual(called,['https://legwork.example/health','https://legwork.example/']);
});
test('Availability fails after two unhealthy checks; never trusts HTTP 200 alone',async()=>{
 const fetchImpl=async(url)=>url.endsWith('/health')
  ?{ok:true,headers:headers('application/json'),json:async()=>({ok:false})}
  :{ok:true,headers:headers('text/html'),text:async()=>'<title>LEGWORK</title>'};
 const result=await probeSchool('https://legwork.example/',{fetchImpl,timeoutMs:50});
 assert.equal(result.ok,false);
 assert.equal(result.checks[0].status,'failed');
 await assert.rejects(probeSchool('http://legwork.example',{fetchImpl}),/HTTPS/);
});
