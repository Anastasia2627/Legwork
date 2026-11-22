import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { patchIconvLite } from '../scripts/patch-iconv-cloudflare.mjs';

test('fixes browser false stream shims only in iconv-lite packages (root and nested)', () => {
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'legwork-iconv-'));
 try {
  const root = path.join(temp, 'node_modules');
  const cases = [
    ['iconv-lite', '0.6.3', { './lib/streams': false, './lib/extend-node': false }],
    ['body-parser/node_modules/iconv-lite', '0.4.24', { './lib/streams': false, './lib/extend-node': false, another: 'keep.js' }],
    ['raw-body/node_modules/iconv-lite', '0.7.0', { stream: false }],
  ];
  for (const [directory, version, browser] of cases) {
   const folder = path.join(root, directory);
   fs.mkdirSync(folder, {recursive:true});
   fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({name:'iconv-lite',version,browser}));
  }
  fs.mkdirSync(path.join(root,'unrelated'),{recursive:true});
  fs.writeFileSync(path.join(root,'unrelated/package.json'), JSON.stringify({name:'unrelated',browser:{'stream':false}}));
  const changed = patchIconvLite(root);
  assert.equal(changed.length, 3);
  const pkg = directory => JSON.parse(fs.readFileSync(path.join(root, directory, 'package.json'),'utf8'));
  assert.equal(pkg('iconv-lite').browser,undefined);
  assert.deepEqual(pkg('body-parser/node_modules/iconv-lite').browser,{another:'keep.js'});
  assert.equal(pkg('raw-body/node_modules/iconv-lite').browser,undefined);
  assert.deepEqual(pkg('unrelated').browser,{stream:false});
  assert.equal(patchIconvLite(root).length,0,'patch must be idempotent');
 } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
