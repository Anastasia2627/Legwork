import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const browserDir=new URL('../e2e/',import.meta.url);

test('All Playwright spec files parse before launching browser containers',()=>{
 const specs=readdirSync(browserDir).filter(file=>file.endsWith('.spec.js'));
 assert.ok(specs.length>0,'Browser test specs are missing');
 for(const file of specs){
  const path=fileURLToPath(new URL(file,browserDir));
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,file+' has invalid JavaScript: '+(result.stderr||result.error||''));
 }
});
