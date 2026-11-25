import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSeoModel,renderPublicSeo,sitemapXml,robotsText,seoIndexAllowed,canonicalOrigin} from '../lib/public-seo.js';

const origin='https://school.example.org';
const courses=[
 {id:1,slug:'legwork-lab',title:'Legwork Lab',description:'Technique training.',active:1,lesson_count:12},
 {id:2,slug:'wave-lab',title:'Wave $& <script> Lab',description:'Practice waves </script><script>bad()</script>',active:1,lesson_count:5},
 {id:3,slug:'draft-course',title:'Private draft',active:0},
 {id:4,slug:'archived-course',title:'Archived program',active:2},
];
const db={prepare(sql){
 if(sql.includes('FROM courses c')){
  assert.ok(sql.includes('c.active=1'));
  assert.ok(sql.includes('l.published=1'));
  return {all:()=>courses.filter(c=>c.active===1)};
 }
 if(sql.includes('editorial_content'))return {get:(page,lang)=>page==='home'&&lang==='es'?{content_json:JSON.stringify({metaTitle:'Escuela de prueba',metaDescription:'Clases de baile.'})}:undefined};
 throw Error('Unexpected SQL: '+sql);
}};
const template='<html lang="en"><head><title>Old title</title><meta name="description" content="Old description"></head><body><div class="loading">Preparing your experience…</div></body></html>';

test('SEO catalog excludes unpublished and archived courses and canonicalizes flagship alias',()=>{
 assert.equal(publicSeoModel(db,'/course/draft-course'),null);
 assert.equal(publicSeoModel(db,'/course/archived-course'),null);
 assert.equal(publicSeoModel(db,'/course/unknown'),null);
 assert.equal(publicSeoModel(db,'/course/legwork-lab').path,'/course');
 assert.equal(publicSeoModel(db,'/course/wave-lab').path,'/course/wave-lab');
 const paths=publicSeoModel(db,'sitemap').paths;
 assert.ok(paths.includes('/courses'));
 assert.ok(paths.includes('/course/wave-lab'));
 assert.ok(paths.includes('/es/course'));
 assert.ok(!paths.includes('/course/legwork-lab'));
 assert.ok(!paths.some(p=>p.includes('draft')||p.includes('archived')||p.includes('account')));
 const xml=sitemapXml(origin,paths);
 assert.ok(xml.includes(origin+'/course/wave-lab'));
 assert.ok(!xml.includes('Private draft'));
});

test('Spanish editorial metadata and hreflang are reciprocal; untranslated courses have no fake alternate',()=>{
 const es=publicSeoModel(db,'/es'),en=publicSeoModel(db,'/');
 assert.equal(es.lang,'es');assert.equal(es.title,'Escuela de prueba');
 assert.deepEqual(es.alternates,en.alternates);
 assert.equal(publicSeoModel(db,'/es/course/wave-lab'),null);
 assert.equal(publicSeoModel(db,'/course/wave-lab').alternates,null);
 const html=renderPublicSeo(template,es,origin,false);
 assert.ok(html.includes('<html lang="es">'));
 assert.ok(html.includes('hreflang="es" href="'+origin+'/es"'));
 assert.ok(html.includes('hreflang="en" href="'+origin+'/"'));
 assert.ok(html.includes('href="/course/wave-lab"'));
});

test('SEO rendering escapes stored content and JSON-LD while preserving literal dollar text',()=>{
 const model=publicSeoModel(db,'/course/wave-lab');
 const html=renderPublicSeo(template,model,origin,false);
 assert.ok(html.includes('Wave $&amp; &lt;script&gt; Lab'));
 assert.ok(!html.includes('<script>bad()'));
 assert.ok(html.includes('content="noindex,nofollow"'));
 const raw=html.match(/<script type="application\/ld\+json" id="publicSeoSchema">([\s\S]+?)<\/script>/)[1];
 assert.ok(!raw.includes('<'));
 const schema=JSON.parse(raw);
 assert.equal(schema['@type'],'Course');
 assert.equal(schema.name,courses[1].title);
 assert.equal(schema.url,origin+'/course/wave-lab');
 assert.ok(!JSON.stringify(schema).includes('video_url'));
});

test('Indexing requires exact configured HTTPS production origin and explicit opt-in',()=>{
 const ready={enabled:true,stage:'production',origin,requestOrigin:origin};
 assert.equal(seoIndexAllowed(ready),true);
 for(const change of [{enabled:false},{stage:'staging'},{origin:'http://school.example.org'},{origin:undefined},{origin:origin+'/path'},{requestOrigin:'https://other.example.org'}])assert.equal(seoIndexAllowed({...ready,...change}),false);
 assert.equal(canonicalOrigin(origin+'/path'),null);
 assert.ok(robotsText(origin,false).includes('Disallow: /\n'));
 assert.ok(!robotsText(origin,false).includes('Sitemap:'));
 assert.ok(robotsText(origin,true).includes(origin+'/sitemap.xml'));
 assert.ok(renderPublicSeo(template,publicSeoModel(db,'/'),origin,true).includes('content="index,follow"'));
});
