/** Preserve the deployed production object name forever. Each named Wrangler
 * environment owns its own Durable Object namespace, independent of this ID.
 */
const ids=Object.freeze({production:'legwork-production',staging:'legwork-staging'});
export function resolveSchoolEnvironment(env,url){
 const stage=env?.DEPLOYMENT_STAGE||'production'; // Legacy production config remains production.
 if(!Object.hasOwn(ids,stage))throw Error('Unexpected LEGWORK deployment environment');
 const host=new URL(url).hostname.toLowerCase();
 const local=['localhost','127.0.0.1','::1'].includes(host);
 if(!local&&stage==='staging'&&!host.startsWith('legwork-school-staging.')&&!host.startsWith('staging.'))
  throw Error('Staging Worker is not running on a staging hostname');
 if(!local&&stage==='production'&&(host.startsWith('legwork-school-staging.')||host.startsWith('staging.')))
  throw Error('Production Worker cannot serve a staging hostname');
 if(stage==='staging'&&env?.PAYMENT_PROVIDER&&env.PAYMENT_PROVIDER!=='disabled')
  throw Error('Staging may not enable payments');
 if(stage==='staging'&&env?.PUBLIC_INDEXING_ENABLED==='true')
  throw Error('Staging cannot be indexed');
 return {stage,objectName:ids[stage]};
}
