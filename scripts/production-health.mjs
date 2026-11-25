#!/usr/bin/env node
/**
 * Read-only production availability + permission smoke.
 * Checks ONLY public data and rejected anonymous requests.
 * Never authenticates, mutates the school, or prints sensitive response bodies.
 */
const PUBLIC_ENDPOINTS=[
 {path:'/health',kind:'health'},
 {path:'/',kind:'homepage'},
 {path:'/api/courses',kind:'courses'},
 {path:'/api/lessons',kind:'lessons'},
 {path:'/api/bundles',kind:'bundles'},
 {path:'/api/content',kind:'content'},
 {path:'/api/media',kind:'media'},
];
const PRIVATE_ENDPOINTS=['/api/dashboard','/api/admin/overview'];
const MAX_PAYLOAD_BYTES=512_000;

function statusReason(status,kind) {
 if(status===503) return kind==='health'?'Backend unavailable (503; check Worker runtime secrets and initialization)':'Backend unavailable (503)';
 if(status===429)return 'Rate limited (429)';
 return 'HTTP '+status;
}

async function responseBody(response) {
 const type=response.headers?.get?.('content-type')||'';
 if(!type.toLowerCase().includes('json'))throw Error('Expected JSON response');
 const sizeHeader=Number(response.headers?.get?.('content-length')||0);
 if(sizeHeader>MAX_PAYLOAD_BYTES)throw Error('Unexpectedly large API response');
 const raw=await response.text();
 if(raw.length>MAX_PAYLOAD_BYTES)throw Error('Unexpectedly large API response');
 try {return JSON.parse(raw)} catch {throw Error('Invalid API JSON')}
}

function verifyPublic(kind,data) {
 if(kind==='health') {
  if(data?.ok!==true)throw Error('Database health check failed');
  return;
 }
 if(kind==='courses'||kind==='lessons'||kind==='bundles'){
  if(!Array.isArray(data?.[kind]))throw Error('Public '+kind+' array missing');
  if((kind==='courses'||kind==='lessons')&&data[kind].length===0)throw Error('Public '+kind+' catalog empty');
  if(kind==='lessons'&&JSON.stringify(data).includes('"video_url"'))throw Error('Public catalog exposes a private video field');
 } else if(kind==='content') {
  if(!data?.pages?.home?.en)throw Error('Public editorial content missing');
 } else if(kind==='media') {
  if(!data?.assets||typeof data.assets!=='object'||Array.isArray(data.assets))throw Error('Public media registry missing');
 }
}

export async function probeSchool(origin,{fetchImpl=fetch,timeoutMs=8000,delayMs=750}={}) {
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)
  throw Error('Monitor requires a public HTTPS origin');
 const results=[];
 const call=async(path,kind)=>{
  let last;
  for(let attempt=1;attempt<=2;attempt++){
   try {
    const response=await fetchImpl(url.origin+path,{
     method:'GET',redirect:'error',
     headers:{'Cache-Control':'no-cache','Accept':kind==='homepage'?'text/html':'application/json'},
     signal:AbortSignal.timeout(timeoutMs)
    });
    if(kind==='private') {
     if(response.status!==401)throw Error(response.status===200?'Anonymous access unexpectedly allowed':statusReason(response.status,kind));
    }else if(!response.ok)throw Error(statusReason(response.status,kind));
    else if(kind==='homepage'){
     const type=response.headers?.get?.('content-type')||'';
     if(!type.includes('html'))throw Error('Expected HTML response');
     const html=await response.text();
     if(!/SVITLANA|LEGWORK/i.test(html))throw Error('Homepage content missing');
    }else{
     const json=await responseBody(response);
     verifyPublic(kind,json);
     if(kind==='lessons')return {path,status:'ok',attempt,data:json};
    }
    return {path,status:'ok',attempt};
   } catch(error){
    last=error;
    if(attempt===1&&delayMs>0)await new Promise(ok=>setTimeout(ok,delayMs));
   }
  }
  return {path,status:'failed',reason:String(last?.message||'Unknown error').slice(0,130)};
 };
 let publicLessons=null;
 for(const endpoint of PUBLIC_ENDPOINTS) {
  const result=await call(endpoint.path,endpoint.kind);
  if(endpoint.kind==='lessons'&&result.status==='ok')publicLessons=result.data.lessons;
  delete result.data;
  results.push(result);
 }
 for(const path of PRIVATE_ENDPOINTS) results.push(await call(path,'private'));
 const paidLesson=publicLessons?.find(l=>!l.free&&Number.isSafeInteger(l.id)&&l.id>0);
 if(paidLesson) results.push(await call('/api/lessons/'+paidLesson.id+'/watch','private'));
 else results.push({path:'paid-lesson-access',status:'failed',reason:'Unable to verify paid lesson protection'});
 return {ok:results.every(r=>r.status==='ok'),checks:results};
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const origin=process.argv[2];
 if(!origin){console.error('Usage: node scripts/production-health.mjs https://your-production-worker');process.exitCode=2}
 else try{
  const result=await probeSchool(origin);
  for(const check of result.checks) console.log(check.path+': '+check.status+(check.reason?' ('+check.reason+')':''));
  if(!result.ok)process.exitCode=1;
 }catch(error){console.error('Health monitor failed:',error.message);process.exitCode=1}
}
