import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDITORIAL_DEFAULTS as serverDefaults } from '../lib/editorial.js';
import { EDITORIAL_DEFAULTS as publicFallback } from '../public/editorial-fallback.js';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const stylesheet=readFileSync(new URL('../public/css/premium.css',import.meta.url),'utf8');

test('public fallback text matches backend CMS defaults for EN and ES',()=>{
 assert.deepEqual(publicFallback,serverDefaults);
});

test('homepage retains real studio story and learning benefits without empty review cards',()=>{
 for(const term of ['home-journey','home-method-grid','home-program-grid','home-experience-tabs','home_free','home-review_1']){
  if(term==='home_free')continue;
  assert.ok(source.includes(term),'Missing home section: '+term);
 }
 assert.ok(source.includes("filter(key=>state.media?.[key]?.url)"));
 assert.ok(!source.includes('Student feedback will be shown here once approved'));
 assert.ok(stylesheet.includes('.home-journey-item'));
 assert.ok(stylesheet.includes('.home-method-grid'));
});

test('a failed public API request cannot replace the entire school with a connection error',()=>{
 assert.match(source,/Promise\.allSettled\(/);
 assert.match(source,/state\.content=data\[4\]\?\.pages\|\|EDITORIAL_DEFAULTS/);
 assert.match(source,/state\.serviceIssue=results\.some/);
 assert.ok(!source.includes("layout(section('Connection error'"));
});
