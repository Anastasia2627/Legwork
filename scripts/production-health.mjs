#!/usr/bin/env node
/**
 * Read-only availability probe; suitable for a lightweight GitHub Actions
 * scheduled monitor. It never authenticates or exposes student data.
 */
export async function probeSchool(origin,{fetchImpl=fetch,timeoutMs=8000}={}){
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)
  throw Error('Monitor requires a public HTTPS origin');
 const results=[];
 for(const path of ['/health','/']){
  let last=null;
  for(let attempt=1;attempt<=2;attempt++){
   try{
    const response=await fetchImpl(url.origin+path,{redirect:'error',
     headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(timeoutMs)});
    const contentType=response.headers?.get?.('content-type')||'';
    if(!response.ok)throw Error('HTTP '+response.status);
    if(path==='/health'){
     if(!contentType.includes('json'))throw Error('Unexpected health response type');
     const body=await response.json();if(body?.ok!==true)throw Error('Database health check failed');
    }else{
     if(!contentType.includes('html'))throw Error('Unexpected homepage response type');
     const text=await response.text();
     if(!/SVITLANA|LEGWORK/i.test(text))throw Error('Unexpected homepage content');
    }
    last=null;results.push({path,status:'ok',attempt});
    break;
   }catch(error){
    last=error;
    if(attempt===1)await new Promise(ok=>setTimeout(ok,750));
   }
  }
  if(last)results.push({path,status:'failed',reason:last.message.slice(0,120)});
 }
 return {ok:results.every(r=>r.status==='ok'),checks:results};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const origin=process.argv[2];
 if(!origin){console.error('Usage: node scripts/production-health.mjs https://your-production-worker');process.exitCode=2}
 else try{
  const result=await probeSchool(origin);
  for(const check of result.checks)console.log(check.path+': '+check.status+(check.reason?' ('+check.reason+')':''));
  if(!result.ok)process.exitCode=1;
 }catch(error){console.error('Health monitor failed:',error.message);process.exitCode=1}
}
