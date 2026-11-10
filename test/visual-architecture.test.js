import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=relative=>readFileSync(new URL('../'+relative,import.meta.url),'utf8');

test('All screen styles load as separate maintained modules',()=>{
 const html=read('public/index.html');
 const paths=[
  'css/core.css','css/components.css','css/pages/home.css',
  'css/pages/course.css','css/pages/shop.css','css/pages/mentorship.css',
  'css/pages/account.css'
 ];
 for(const path of paths){
  assert.match(html,new RegExp('href="/'+path.replace(/\./g,'\\.')+'\\?v='));
  assert.ok(read('public/'+path).length>100,path+' missing/empty');
 }
 assert.doesNotMatch(html,/design-system\.css|reference-layout\.css/);
});

test('There is a real media registry instead of hidden image placeholders',()=>{
 const media=read('public/media.js');
 const app=read('public/app.js');
 assert.match(media,/poleconvention\.com/);
 assert.match(media,/credit:/);
 assert.match(app,/mediaFigure\('portrait'/);
 assert.match(app,/mediaFigure\('stage'/);
 assert.match(app,/lesson-cover-image/);
});

test('Lesson covers are optional, public and backward compatible',()=>{
 const server=read('server.js');
 const features=read('lib/features.js');
 assert.match(server,/ALTER TABLE lessons ADD COLUMN cover_url/);
 assert.match(server,/l\.cover_url/);
 assert.match(server,/cover&&!safePublicImageUrl\(cover,safeExternalUrl\)/);
 assert.match(features,/cover_url=\?/);
 assert.match(read('public/app.js'),/name="cover_url"/);
});

test('Readable type hierarchy uses no third typeface',()=>{
 const core=read('public/css/core.css');
 assert.match(core,/Archivo\+Black/);
 assert.match(core,/DM\+Sans/);
 assert.match(core,/h2,\.section h2/);
 assert.match(core,/var\(--font-body\)/);
});
