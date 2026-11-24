import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveSchoolEnvironment} from '../cloudflare/environment.js';
test('Separate staging namespace, migration, vars and safe publication',()=>{
 const cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(cfg.name,'legwork-school');
 assert.equal(cfg.vars.DEPLOYMENT_STAGE,'production');
 assert.equal(cfg.env.staging.vars.DEPLOYMENT_STAGE,'staging');
 assert.equal(cfg.env.staging.vars.PAYMENT_PROVIDER,'disabled');
 assert.equal(cfg.env.staging.vars.PUBLIC_INDEXING_ENABLED,'false');
 assert.equal(cfg.env.staging.workers_dev,true);
 assert.ok(cfg.env.staging.durable_objects.bindings.some(b=>b.name==='SCHOOL'&&b.class_name==='LegworkStore'&&!b.script_name));
 assert.ok(cfg.env.staging.migrations.some(m=>m.new_sqlite_classes?.includes('LegworkStore')));
});
test('Production identity unchanged, staging different',()=>{
 assert.equal(resolveSchoolEnvironment({DEPLOYMENT_STAGE:'production'},'https://legwork-school.example.workers.dev').objectName,'legwork-production');
 assert.equal(resolveSchoolEnvironment({},'http://127.0.0.1:8787').objectName,'legwork-production');
 assert.equal(resolveSchoolEnvironment({DEPLOYMENT_STAGE:'staging',PAYMENT_PROVIDER:'disabled'},'https://legwork-school-staging.example.workers.dev').objectName,'legwork-staging');
});
test('Reject cross-environment host, paid staging, indexing, invalid environment',()=>{
 assert.throws(()=>resolveSchoolEnvironment({DEPLOYMENT_STAGE:'staging'},'https://legwork-school.example.workers.dev'),/Staging Worker/);
 assert.throws(()=>resolveSchoolEnvironment({DEPLOYMENT_STAGE:'production'},'https://legwork-school-staging.example.workers.dev'),/Production Worker/);
 assert.throws(()=>resolveSchoolEnvironment({DEPLOYMENT_STAGE:'staging',PAYMENT_PROVIDER:'wayforpay'},'https://legwork-school-staging.example.workers.dev'),/payments/);
 assert.throws(()=>resolveSchoolEnvironment({DEPLOYMENT_STAGE:'staging',PUBLIC_INDEXING_ENABLED:'true'},'https://legwork-school-staging.example.workers.dev'),/indexed/);
 assert.throws(()=>resolveSchoolEnvironment({DEPLOYMENT_STAGE:'x'},'http://localhost:8787'),/Unexpected/);
});
