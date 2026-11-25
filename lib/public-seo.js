import {EDITORIAL_DEFAULTS} from './editorial.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clip=(value,max)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const staticPages={
 '/':{page:'home'},
 '/shop':{title:'Online Dance Classes & Bundles | Legwork',description:'Browse individual online dance technique classes and lesson bundles.'},
 '/courses':{title:'Online Dance Courses | Legwork',description:'Explore published online dance courses and training programs.'},
 '/mentorship':{page:'mentorship'}
};
const localized=new Set(['/','/course','/mentorship']);
export function canonicalOrigin(value){
 try{const u=new URL(value);return u.protocol==='https:'&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password?u.origin:null}catch{return null}
}
export function seoIndexAllowed({enabled,stage,origin,requestOrigin}){
 return enabled===true&&stage==='production'&&!!canonicalOrigin(origin)&&canonicalOrigin(origin)===requestOrigin;
}
const coursePath=c=>c.slug==='legwork-lab'?'/course':'/course/'+encodeURIComponent(c.slug);
const langPath=(path,lang)=>lang==='es'?(path==='/'?'/es':'/es'+path):path;
export function publicSeoModel(db,path){
 const courses=db.prepare("SELECT c.id,c.slug,c.title,c.description,c.price,c.guru_price,(SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id AND l.published=1) AS lesson_count FROM courses c WHERE c.active=1 ORDER BY c.id").all();
 const list=courses.filter(c=>/^[a-z0-9-]{2,80}$/.test(c.slug));
 const flagship=list.find(c=>c.slug==='legwork-lab');
 const paths=['/','/courses','/shop','/mentorship',...list.map(coursePath),'/es','/es/mentorship',...(flagship?['/es/course']:[])];
 if(path==='sitemap')return {paths};
 const es=path==='/es'||path.startsWith('/es/'),lang=es?'es':'en',base=es?(path.slice(3)||'/'):path;
 if(es&&!localized.has(base))return null;
 const course=base==='/course'||base==='/course/legwork-lab'?flagship:list.find(c=>coursePath(c)===base);
 if(base.startsWith('/course/')||base==='/course'){
  if(!course)return null;
 }else if(!Object.hasOwn(staticPages,base))return null;
 const canonical=course?coursePath(course):base;
 let entry=staticPages[canonical]||{};
 if(course&&course.slug==='legwork-lab')entry={page:'course'};
 let title,description,heading,intro;
 if(entry.page){
  const defaults=EDITORIAL_DEFAULTS[entry.page][lang];
  let stored={};try{stored=JSON.parse(db.prepare('SELECT content_json FROM editorial_content WHERE page=? AND lang=?').get(entry.page,lang)?.content_json||'{}')}catch{}
  const get=key=>typeof stored?.[key]==='string'&&stored[key].trim()?stored[key]:defaults[key];
  title=get('metaTitle');description=get('metaDescription');heading=get('headline')||[get('headlineTop'),get('headlineAccent')].filter(Boolean).join(' ');intro=get('intro');
 }else if(course){title=course.title+' | Legwork';description=course.description;heading=course.title;intro=course.description;}
 else{({title,description}=entry);heading=title;intro=description;}
 const links=[{path:langPath('/',lang),title:lang==='es'?'Inicio':'Home'},{path:'/courses',title:lang==='es'?'Cursos':'All courses'},{path:'/shop',title:lang==='es'?'Clases':'Classes'},{path:langPath('/mentorship',lang),title:lang==='es'?'Mentoría':'Mentorship'},...list.map(c=>({path:c.slug==='legwork-lab'?langPath(coursePath(c),lang):coursePath(c),title:c.title}))];
 return {path:langPath(canonical,lang),lang,title:clip(title,100),description:clip(description||title,170),heading:clip(heading||title,180),intro:clip(intro||description,1000),course:course?{title:course.title,description:course.description,lesson_count:course.lesson_count}:null,alternates:localized.has(canonical)?{en:canonical,es:langPath(canonical,'es')}:null,links};
}
export function renderPublicSeo(template,model,origin,indexAllowed=false){
 const canonical=origin+model.path,title=esc(model.title),description=esc(model.description);
 const alternates=model.alternates?Object.entries({...model.alternates,'x-default':model.alternates.en}).map(([lang,path])=>'<link rel="alternate" hreflang="'+lang+'" href="'+esc(origin+path)+'">').join(''):'';
 const structured=model.course?{'@context':'https://schema.org','@type':'Course',name:model.course.title,description:model.course.description,url:canonical,provider:{'@type':'Organization',name:'Legwork Online School',url:origin}}:{'@context':'https://schema.org','@type':model.path==='/'||model.path==='/es'?'WebSite':'WebPage',name:model.title,description:model.description,url:canonical,inLanguage:model.lang};
 const json=JSON.stringify(structured).replace(/</g,'\\u003c');
 const tags='<meta name="robots" content="'+(indexAllowed?'index,follow':'noindex,nofollow')+'" data-index-enabled="'+indexAllowed+'"><link rel="canonical" href="'+esc(canonical)+'">'+alternates+'<meta property="og:type" content="website"><meta property="og:title" content="'+title+'"><meta property="og:description" content="'+description+'"><meta property="og:url" content="'+esc(canonical)+'"><meta property="og:locale" content="'+(model.lang==='es'?'es_ES':'en_US')+'"><meta name="twitter:card" content="summary"><script type="application/ld+json" id="publicSeoSchema">'+json+'</script>';
 const fallback='<section class="seo-fallback section"><h1>'+esc(model.heading)+'</h1><p>'+esc(model.intro)+'</p><nav aria-label="'+(model.lang==='es'?'Páginas de la escuela':'School pages')+'">'+model.links.map(l=>'<a href="'+esc(l.path)+'">'+esc(l.title)+'</a>').join(' · ')+'</nav></section>';
 return template.replace(/<html lang="[^"]*">/,'<html lang="'+model.lang+'">').replace(/<title>[^<]*<\/title>/,'<title>'+title+'</title>').replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="'+description+'">').replace('</head>',tags+'</head>').replace('<div class="loading">Preparing your experience…</div>',fallback);
}
export function sitemapXml(origin,paths){
 return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...new Set(paths)].map(path=>'<url><loc>'+esc(origin+path)+'</loc></url>').join('')+'</urlset>';
}
export function robotsText(origin,enabled){
 return enabled?'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: '+origin+'/sitemap.xml\n':'User-agent: *\nDisallow: /\n';
}
