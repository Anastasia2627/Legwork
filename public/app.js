import {translatePage,translateText} from './i18n.js';
import {mediaFigure} from './media.js';
import {editorialEditor} from './editorial-admin.js';
import {studentCertificatesMarkup,adminCertificatesMarkup,verifyCertificateView} from './certificates.js';
import {renderStudy} from './learning.js';
import {beginCheckout,resumeCheckout,renderPaymentStatus,orderSelectionMarkup,paymentHistoryMarkup} from './checkout.js';
const $=s=>document.querySelector(s),app=$('#app');
const readCart=()=>{try{const v=JSON.parse(localStorage.getItem('legwork_cart')||'[]');return Array.isArray(v)?[...new Set(v.filter(Number.isSafeInteger))].slice(0,30):[]}catch{return []}};
const readBundleCart=()=>{try{const ids=JSON.parse(localStorage.getItem('legwork_bundle_cart')||'[]');return Array.isArray(ids)?[...new Set(ids.filter(Number.isSafeInteger))].slice(0,30):[]}catch{return []}};
const state={user:null,courses:[],lessons:[],bundles:[],content:null,dashboard:null,admin:null,cart:readCart(),bundleCart:readBundleCart(),lang:localStorage.getItem('legwork_lang')==='es'?'es':'en',tab:'overview'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>'$'+(c/100).toFixed(0);
const t=(en,es)=>state.lang==='es'?es:en;
const api=async(url,method='GET',data)=>{const r=await fetch('/api'+url,{method,headers:{...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,credentials:'same-origin'});const d=await r.json();if(!r.ok)throw Error(translateText(d.error||'Request failed',state.lang));return d};
const askConfirmation=message=>window.confirm(translateText(message,state.lang));
const askReason=message=>window.prompt(translateText(message,state.lang));
const notice=m=>{const el=$('#toast');el.textContent=translateText(m,state.lang);el.style.display='block';clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.style.display='none',4200)};
const btn=(label,route,style='btn-red')=>'<a class="btn '+style+'" href="#/'+route+'">'+label+'</a>';
const card=(title,body,tag='')=>'<div class="card"><div class="card-body">'+(tag?'<p class="eyebrow">'+tag+'</p>':'')+'<h3>'+esc(title)+'</h3><p>'+body+'</p></div></div>';
const visual=(label,type='dark')=>'<div class="visual '+type+'"><b>'+esc(label)+'</b></div>';
const faq=(arr)=>'<div class="faq">'+arr.map(([q,a])=>'<details><summary>'+esc(q)+'</summary><p>'+esc(a)+'</p></details>').join('')+'</div>';
const getId=(route)=>Number(route.split('/')[1]);
const syncHeader=()=>{$('#accountLink').textContent=state.user?(state.lang==='es'?'Mi cuenta':'My account'):(state.lang==='es'?'Iniciar sesión':'Log in');$('#cartCount').textContent=state.cart.length+state.bundleCart.length;$('#langBtn').textContent=state.lang.toUpperCase()+' / '+(state.lang==='en'?'ES':'EN');document.documentElement.lang=state.lang;const cartLabel=$('#cartBtn')?.firstChild;if(cartLabel)cartLabel.nodeValue=(state.lang==='es'?'Cesta ':'Bag ');$('#cartDrawer')?.setAttribute('aria-label',state.lang==='es'?'Cesta de compra':'Shopping cart');document.querySelectorAll('#nav [data-i18n]').forEach(a=>{const labels={about:['About','Sobre mí'],courses:['Courses','Cursos'],classes:['Classes','Clases'],mentorship:['Mentorship','Mentoría']};a.textContent=labels[a.dataset.i18n]?.[state.lang==='es'?1:0]||a.textContent});const start=document.querySelector('.header-cta');if(start)start.textContent=state.lang==='es'?'Empezar':'Get started';}
const editorial=(page,key)=>{
 const value=state.content?.[page]?.[state.lang]?.[key]??'';
 // Old locally seeded editorial values can outlive a redesign.
 // Replace only the original legacy slogans; keep genuine admin edits intact.
 const outdated={
  en:{home:{headlineTop:{'MOVE LIKE':'HI THERE! SVITLANA YURCHAK,'},headlineAccent:{'A BOSS.':'EXOTIC POLE ARTIST & COACH'},intro:{'Learn exotic pole dance with confidence, intention, and movement that feels unmistakably yours.':'Online exotic pole dance lessons from the basics to advanced technique.'}}},
  es:{home:{headlineTop:{'MUÉVETE COMO':'HOLA, SOY SVITLANA YURCHAK,'},headlineAccent:{'UNA JEFA.':'ARTISTA Y PROFESORA DE EXOTIC POLE'}}}
 };
 return esc(outdated[state.lang]?.[page]?.[key]?.[value]??value)
};
const refreshMeta=()=>{const route=(location.hash.startsWith('#/')?location.hash.slice(2):(location.pathname.replace(/^\//,'')||'')).split(/[?#]/)[0];const page=route===''?'home':route==='course'?'course':route==='mentorship'?'mentorship':null;const values=page?state.content?.[page]?.[state.lang]:null;const shop=route==='shop';document.title=values?.metaTitle||(shop?'Online Dance Classes & Bundles | Legwork':'Legwork · Online Dance School');const description=document.querySelector('meta[name="description"]');if(description)description.setAttribute('content',values?.metaDescription||(shop?'Browse individual pole dance technique classes and lesson bundles.':'Online dance lessons and mentorship at Legwork.'));
 const publicPath=route===''?'/':['course','shop','mentorship'].includes(route)?'/'+route:null;
 const canonical=document.querySelector('link[rel="canonical"]');
 if(canonical&&publicPath)canonical.href=location.origin+publicPath;
 const robots=document.querySelector('meta[name="robots"]');
 if(robots)robots.content=publicPath&&robots.dataset.indexEnabled==='true'?'index,follow':'noindex,nofollow';
};
function layout(markup){app.innerHTML=markup;syncHeader();translatePage(app,state.lang);translatePage(document.querySelector('footer'),state.lang);refreshMeta()}
function section(title,content,kicker='',cls=''){return '<section class="section '+cls+'"><div class="section-inner">'+(kicker?'<p class="eyebrow">'+kicker+'</p>':'')+(title?'<h2>'+title+'</h2>':'')+content+'</div></section>'}
function home(){
 const milestones=[
  ['01 / THE BEGINNING','Started pole at 21, without a dance or sports background.'],
  ['02 / A NEW DIRECTION','After shoulder and back injuries, began exploring floor waves and exotic movement.'],
  ['03 / THE TECHNIQUE','Developed original elements and the Flexi Legs approach.'],
  ['04 / ON THE ROAD','Performed, taught masterclasses and worked at events around the world.'],
  ['05 / TODAY','An online school and a community of more than 5,000 students.']
 ];
 const reasons=[
  ['01','A true starting point','Lessons explain the foundations instead of assuming you already know them.'],
  ['02','Technique over force','Work with control, coordination and movement quality.'],
  ['03','A clear progression','Build individual elements before combining them.'],
  ['04','Room to grow','Go from your first lesson to more advanced combinations.']
 ];
 layout(
  '<section class="ref-hero"><div class="ref-wrap"><div class="hero-copy"><p class="eyebrow" data-no-i18n>'+editorial('home','eyebrow')+'</p><h1 data-no-i18n>'+editorial('home','headlineTop')+' '+editorial('home','headlineAccent')+'</h1><p data-no-i18n>'+editorial('home','intro')+'</p>'+btn(editorial('home','cta'),'course')+'</div>'+mediaFigure('portrait','hero-portrait')+'</div></section>'+
  section('My story','<div class="ref-timeline">'+milestones.map(([title,desc])=>'<div class="ref-time-item"><strong>'+title+'</strong><p>'+desc+'</p></div>').join('')+'</div>','FROM THE FIRST CLASS TO TODAY')+
  section('The way I teach','<div class="ref-reasons">'+reasons.map(([num,title,desc])=>'<div class="ref-reason"><span>'+num+'</span><div><h3>'+title+'</h3><p>'+desc+'</p></div></div>').join('')+'</div>','','muted-section')+
  section('Your next move','<div class="ref-courses"><a class="ref-featured" href="#/course"><span class="ref-featured-eyebrow">THE SIGNATURE COURSE</span><strong class="course-home-name"><span>LEGWORK</span> LIKE A <em>BOSS</em></strong><p>Learn smooth legwork through a structured path of technique and practice.</p><span class="course-text-link">Discover the course →</span></a><div class="ref-upcoming"><div><strong>WAVE LIKE A <em>BOSS</em></strong><span>Coming later</span></div><div><strong>SPLIT LIKE A <em>BOSS</em></strong><span>Coming later</span></div></div></div>')+
  section('On stage & beyond','<div class="ref-awards"><div><div class="ref-awards-list"><p>TOP-15 UPA · Exotic Dancer of the Year 2016</p><p>Ukraine’s Got Talent · Semifinalist</p><p>Championships, international shows & masterclasses</p><p>Founder of the YURCHAK apparel brand</p></div><p class="ref-awards-note">A career built through performance, teaching and movement research.</p></div><div>'+mediaFigure('stage','stage-photo')+'</div></div>','','muted-section')+
  '<section class="ref-free-strip"><div class="ref-wrap"><div><p class="eyebrow">A FIRST STEP</p><h2>TRY YOUR FIRST LESSON FREE.</h2></div><form id="subscribeForm"><input required class="field" type="email" name="email" placeholder="Your email" aria-label="Email address"><input type="hidden" name="purpose" value="free-lesson"><label><input type="checkbox" name="consent" required> I agree to receive school emails.</label><button class="btn btn-dark">Get free lesson</button></form></div></section>'
 );
}function course(){
 const c=state.courses[0],price=c?money(c.price):'See price at checkout',guruPrice=c?.guru_price?money(c.guru_price):'Price at checkout';
 const audience=[
  ['Beginner','Start with fundamentals, even without a dance background.'],
  ['At a plateau','Work out what is stopping an element from feeling right.'],
  ['Dance experience','Connect technique with smoother transitions.'],
  ['Professional','Refine lines, control and movement detail.']
 ];
 const outcomes=[
  ['Cleaner leg lines','Understand the relationship between knees, ankles and feet.'],
  ['Smoother transitions','Join movements without losing your balance.'],
  ['More body awareness','Recognize weight shifts and stable support.'],
  ['Stronger technique','Build precision without relying on extreme stretching.'],
  ['Your own flow','Turn individual elements into fluid combinations.']
 ];
 const steps=[
  ['01','Prepare','Warm up and learn the fundamentals.'],
  ['02','Learn','Watch bite-sized demonstrations.'],
  ['03','Practise','Work through each element and your homework.'],
  ['04','Progress','Track completed lessons and work toward a certificate with Guru.']
 ];
 const courseLessons=state.lessons.filter(l=>!c||!l.course_id||l.course_id===c.id);
 const freeLesson=courseLessons.find(l=>l.free);
 const tiles=courseLessons.slice(0,12).map((l,i)=>'<a class="course-lesson-row" href="#/lesson/'+l.id+'"><span class="course-lesson-number">'+String(i+1).padStart(2,'0')+'</span><strong>'+esc(l.title)+'</strong><span class="course-lesson-meta">'+esc(l.level||'Technique')+' · '+Number(l.duration||12)+' min</span></a>').join('');
 const faqItems=[
  ['Do I need to be flexible?','No. Start at a comfortable range of motion. The course focuses on technique and control.'],
  ['Do I need a pole?','Some lessons use a pole or stable support. Equipment is listed with each class.'],
  ['How do I access the lessons?','After purchase confirmation, the lessons appear in My Courses in your account.'],
  ['Can I send homework?','The Guru format includes homework submission and teacher feedback.'],
  ['What is the refund policy?','Review the refund terms before payment or contact the school about your order.']
 ];
 layout(
  '<div class="ref-course-bar" id="courseSticky"><div class="ref-wrap"><span class="course-sticky-title">LEGWORK LIKE A BOSS</span><span>from '+price+'</span><a class="btn btn-red" href="#/course#prices">Join the course</a></div></div>'+
  '<section class="ref-course-hero"><div class="ref-wrap"><p class="course-kicker" data-no-i18n>'+editorial('course','eyebrow')+'</p><h1 data-no-i18n>'+editorial('course','headline')+'</h1><div class="course-hero-layout"><div class="course-hero-copy"><p class="course-logo"><span>LEGWORK</span> LIKE A <em>BOSS</em></p><p data-no-i18n>'+editorial('course','intro')+'</p><div class="course-hero-actions"><a href="#/course#prices" class="btn btn-red" data-no-i18n>'+editorial('course','cta')+'</a>'+(freeLesson?'<a class="btn btn-outline" href="#/lesson/'+freeLesson.id+'">Try a free lesson</a>':'')+'</div></div>'+mediaFigure('stage','course-photo')+'</div></div></section>'+
  section('Who is this for?','<div class="course-fit-list">'+audience.map(([title,desc],i)=>'<div class="course-fit-item"><span>'+String(i+1).padStart(2,'0')+'</span><div><h3>'+title+'</h3><p>'+desc+'</p></div></div>').join('')+'</div>','EVERY STAGE HAS A STARTING POINT')+
  section('What will change?','<div class="course-results">'+outcomes.map(([title,desc])=>'<div class="course-result"><span aria-hidden="true">↗</span><div><h3>'+title+'</h3><p>'+desc+'</p></div></div>').join('')+'</div>','MORE THAN JUST MORE MOVES','muted-section')+
  '<section class="course-author"><div class="ref-wrap"><div><span class="eyebrow">YOUR COACH</span><strong>Svitlana Yurchak</strong><p>Exotic pole artist and creator of the Flexi Legs technique.</p></div><a class="course-text-link" href="#/">More about Svitlana →</a></div></section>'+
  section('How it works','<div class="course-steps">'+steps.map(([n,title,desc])=>'<div><span>'+n+'</span><h3>'+title+'</h3><p>'+desc+'</p></div>').join('')+'</div>','A CLEAR PATH, AT YOUR PACE')+
  section('Inside the course','<div class="course-preview-head"><p>Prestart and technique lessons. Every class has its own level, equipment and duration.</p><a class="course-text-link" href="#/shop">Explore individual classes →</a></div><div class="course-lesson-grid">'+(tiles||'<p class="course-empty">Lessons will appear here when added to the library.</p>')+'</div>','THE PROGRAM','muted-section')+
  (freeLesson?'<section class="course-free-section"><div class="ref-wrap"><div class="course-preview-screen"><span aria-hidden="true">▶</span><small>FREE CLASS PREVIEW</small></div><div><p class="eyebrow">TRY BEFORE YOU JOIN</p><h2>Your first lesson is on us.</h2><p>'+esc(freeLesson.title)+' · '+Number(freeLesson.duration||12)+' minutes. Explore the teaching style before you choose a package.</p><a class="btn btn-red" href="#/lesson/'+freeLesson.id+'">Open free lesson</a></div></div></section>':'')+
  '<section class="section course-pricing-section" id="prices"><div class="section-inner"><p class="eyebrow">YOUR TRAINING, YOUR WAY</p><h2>Choose your format</h2><p class="course-pricing-intro">One program, with or without personal feedback.</p><div class="ref-prices"><div class="price-card"><h3>Independent</h3><p class="price">'+price+'</p><ul class="course-includes"><li>Full course library</li><li>Learn at your own pace</li><li>Track your progress</li></ul><button class="btn btn-dark" data-order="course" data-id="'+(c?.id||1)+'">Choose Independent</button></div><div class="price-card featured"><span class="course-featured-label">WITH PERSONAL FEEDBACK</span><h3>Guru</h3><p class="price">'+guruPrice+'</p><ul class="course-includes"><li>Everything in Independent</li><li>Submit homework</li><li>Get teacher feedback</li><li>Certificate pathway after completion</li></ul><button class="btn btn-red" data-order="course" data-plan="guru" data-id="'+(c?.id||1)+'">Choose Guru</button></div></div><p class="course-pricing-note">Final access and payment conditions are shown before checkout.</p></div></section>'+
  section('Frequently asked questions',faq(faqItems),'','course-faq')+
  '<section class="course-final"><div class="ref-wrap"><h2>YOUR LEGWORK STARTS HERE.</h2><a class="btn btn-red" href="#/course#prices">Join the course</a></div></section>'
 );
}function lessonCard(l,studyMode=false){
 const destination=studyMode===true?'study':'lesson',cover=l.cover_url?'<img class="lesson-cover-image" loading="lazy" decoding="async" src="'+esc(l.cover_url)+'" alt="'+esc(l.title)+' lesson cover">':'';
 return '<article class="card lesson-card"><a class="lesson-cover '+(cover?'has-image':'')+'" href="#/'+destination+'/'+l.id+'" aria-label="View '+esc(l.title)+'">'+cover+'<span class="lesson-cover-top">'+esc(l.category||'LEGWORK')+'</span><span class="lesson-cover-index">'+(l.free?'FREE CLASS':'LESSON '+String(l.sort_order||l.id).padStart(2,'0'))+'</span></a><div class="card-body"><p class="meta">'+esc(l.level)+' · '+l.duration+' min · '+esc(l.equipment||'Any support')+'</p><h3><a href="#/'+destination+'/'+l.id+'">'+esc(l.title)+'</a></h3><p class="meta">'+esc(l.teacher||'Svitlana Yurchak')+'</p><div class="row"><b>'+(l.free?'FREE':money(l.price))+'</b><a class="btn btn-small btn-outline" href="#/'+destination+'/'+l.id+'">View lesson</a></div></div></article>';
}
function bundleCard(bundle){
 return '<article class="card bundle-card"><a href="#/bundle/'+bundle.id+'" class="bundle-cover"><span>BUNDLE / '+bundle.lesson_ids.length+' CLASSES</span><span class="bundle-art-mark" aria-hidden="true">↗</span><span>ELEMENT + PRACTICE + WARM-UP</span></a><div class="card-body"><h3><a href="#/bundle/'+bundle.id+'">'+esc(bundle.title)+'</a></h3><p>'+esc(bundle.description)+'</p><div class="row"><span><s class="meta">'+money(bundle.original_price)+'</s> <b class="price">'+money(bundle.price)+'</b></span><button type="button" class="btn btn-red btn-small" data-cart-bundle="'+bundle.id+'">Add to bag</button></div></div></article>';
}function bundlePage(route){
 const id=Number(route.split('/')[1]),b=state.bundles.find(x=>x.id===id);
 if(!b)return layout(section('Bundle unavailable','<p>This bundle is no longer available.</p>'+btn('BACK TO CLASSES','shop')));
 const lessons=b.lesson_ids.map(id=>state.lessons.find(l=>l.id===id)).filter(Boolean);
 layout(section(esc(b.title),'<p class="eyebrow"><a href="#/shop">CLASSES</a> / '+esc(b.direction)+' / BUNDLE</p><div class="grid grid-2"><div>'+bundleCard(b)+'</div><div><p class="description">'+esc(b.description)+'</p><p class="eyebrow">'+lessons.length+' INCLUDED LESSONS</p><div class="stack">'+lessons.map(l=>'<a class="item-row row" href="#/lesson/'+l.id+'"><span>'+esc(l.title)+'</span><span>'+esc(l.level)+' · '+l.duration+' min</span></a>').join('')+'</div><p class="description">One request grants access to every lesson in this bundle after independent payment confirmation.</p><button type="button" class="btn btn-red" data-cart-bundle="'+b.id+'">ADD COMPLETE BUNDLE TO BAG</button></div></div>','BUILD YOUR PRACTICE'));
}
function shop(){
 const q=new URLSearchParams(location.hash.split('?')[1]||'');
 const query={search:q.get('q')||'',category:q.get('category')||'',level:q.get('level')||'',kind:q.get('kind')||'',teacher:q.get('teacher')||'',equipment:q.get('equipment')||'',focus:q.get('focus')||'',duration:q.get('duration')||''};
 const categories=[...new Set([...state.lessons.map(l=>l.category),...state.bundles.map(b=>b.direction)].filter(Boolean))].sort((a,b)=>['Legwork','Waving','Warm-up','Floor work'].indexOf(a)-['Legwork','Waving','Warm-up','Floor work'].indexOf(b));
 const teachers=[...new Set(state.lessons.map(l=>l.teacher).filter(Boolean))];
 const equipment=[...new Set(state.lessons.map(l=>l.equipment).filter(Boolean))];
 const focuses=[...new Set(state.lessons.flatMap(l=>(l.focus||'').split(',').map(v=>v.trim())).filter(Boolean))];
 const active=Object.values(query).some(Boolean);
 const lessons=state.lessons.filter(l=>{
  const words=(l.title+' '+l.category+' '+(l.tags||'')+' '+(l.teacher||'')).toLowerCase();
  return (!query.search||words.includes(query.search.toLowerCase()))&&(!query.category||l.category===query.category)&&(!query.level||l.level===query.level)&&(!query.kind||l.kind===query.kind)&&(!query.teacher||l.teacher===query.teacher)&&(!query.equipment||l.equipment===query.equipment)&&(!query.focus||(l.focus||'').toLowerCase().includes(query.focus.toLowerCase()))&&(!query.duration||l.duration<=Number(query.duration));
 });
 const bundles=state.bundles.filter(b=>(!query.category||b.direction===query.category)&&(!query.kind||query.kind==='Bundle')&&(!query.search||(b.title+' '+b.description).toLowerCase().includes(query.search.toLowerCase()))&&!query.level&&!query.teacher&&!query.equipment&&!query.focus&&!query.duration);
 const option=(key,value)=>'<button type="button" class="shop-filter-option '+(query[key]===value?'is-selected':'')+'" data-shop-filter="'+key+'" data-shop-value="'+esc(value)+'" aria-pressed="'+(query[key]===value?'true':'false')+'"><span class="shop-check" aria-hidden="true"></span><span>'+esc(value)+'</span></button>';
 const filterGroup=(heading,key,values)=>values.length?'<fieldset class="shop-filter-group"><legend>'+heading+'</legend><div class="shop-option-list">'+values.map(v=>option(key,v)).join('')+'</div></fieldset>':'';
 const sidebar=
  '<aside class="shop-sidebar" id="shopFilterPanel" aria-label="Filter classes"><div class="shop-filter-panel-head"><strong>Filters</strong><button id="shopFiltersClose" type="button" aria-label="Close filters">✕</button></div>'+
  filterGroup('Direction','category',categories)+
  filterGroup('Lesson type','kind',['Element','Preparation','Warm-up','Bundle'])+
  filterGroup('Equipment','equipment',equipment)+
  filterGroup('Level','level',['Beginner','Intermediate','Advanced'])+
  filterGroup('Training focus','focus',focuses)+
  filterGroup('Teacher','teacher',teachers)+
  filterGroup('Max. duration','duration',['15','30','60'])+
  (active?'<button type="button" class="shop-reset-filters" data-shop-clear="1">Clear all filters</button>':'')+'</aside>';
 const lessonKinds=[['Element','Elements'],['Preparation','Preparation exercises'],['Warm-up','Warm-ups']];
 const hrefFor=(category,kind)=>'#/shop?category='+encodeURIComponent(category)+(kind?'&kind='+encodeURIComponent(kind):'');
 const rail=(list)=>'<div class="shop-lesson-rail">'+list.slice(0,8).map(l=>lessonCard(l)).join('')+'</div>';
 const shelf=(category)=>{
  const ownLessons=state.lessons.filter(l=>l.category===category);
  const ownBundles=state.bundles.filter(b=>b.direction===category);
  if(!ownLessons.length&&!ownBundles.length)return '';
  const bundlesSection=ownBundles.length?'<div class="shop-shelf-section shop-bundle-section"><div class="shop-shelf-title"><h3>Bundles <span>· element + preparation + warm-up</span></h3><a href="'+hrefFor(category,'Bundle')+'">See all →</a></div><div class="shop-bundle-rail">'+ownBundles.slice(0,2).map(bundleCard).join('')+'</div></div>':'';
  const types=lessonKinds.map(([kind,label])=>{const lessonsOfKind=ownLessons.filter(l=>l.kind===kind);return lessonsOfKind.length?'<div class="shop-shelf-section"><div class="shop-shelf-title"><h3>'+label+'</h3><a href="'+hrefFor(category,kind)+'">See all →</a></div>'+rail(lessonsOfKind)+'</div>':''}).join('');
  const other=ownLessons.filter(l=>!lessonKinds.some(([kind])=>l.kind===kind));
  const extras=other.length?'<div class="shop-shelf-section"><div class="shop-shelf-title"><h3>More classes</h3><a href="'+hrefFor(category,'')+'">See all →</a></div>'+rail(other)+'</div>':'';
  return '<section class="shop-direction" aria-label="'+esc(category)+'"><div class="shop-direction-title"><h2>'+esc(category)+'</h2><a href="'+hrefFor(category,'')+'" class="shop-see-all">All '+esc(category)+' →</a></div>'+bundlesSection+types+extras+'</section>';
 };
 const categoryLinks=categories.map(c=>'<a href="'+hrefFor(c,'')+'" '+(query.category===c?'aria-current="page"':'')+'>'+esc(c)+'</a>').join('');
 const filterNames={category:'Direction',kind:'Type',equipment:'Equipment',level:'Level',focus:'Focus',teacher:'Teacher',duration:'Duration'};
 const activeChips=Object.entries(filterNames).filter(([key])=>query[key]).map(([key,label])=>'<button type="button" class="shop-active-chip" data-shop-filter="'+key+'" data-shop-value="'+esc(query[key])+'">'+label+': '+esc(query[key])+' <span aria-hidden="true">×</span></button>').join('');
 const results=lessons.map(l=>lessonCard(l)).join('')+bundles.map(bundleCard).join('');
 layout(
  '<section class="shop-heading"><div class="section-inner"><h1>CLASSES</h1><p>Learn only what you need right now.</p></div></section>'+
  '<div class="shop-promo"><div class="section-inner"><strong>3 + 1 OFFER</strong><span>Promotion details to be confirmed before launch</span></div></div>'+
  '<section class="shop-main"><div class="shop-layout"><div class="shop-filter-shade" id="shopFilterShade" hidden></div>'+sidebar+
  '<div class="shop-catalog"><div class="shop-search-row"><label class="sr-only" for="shopSearch">Search classes by name or hashtag</label><input class="field" id="shopSearch" type="search" placeholder="Search a lesson or #hashtag (#kneecircle, #legwave)" value="'+esc(query.search)+'"><button type="button" id="shopFiltersToggle" aria-controls="shopFilterPanel" aria-expanded="false">Filters <span aria-hidden="true">☷</span></button></div>'+
  '<nav class="shop-category-links" aria-label="Class directions"><a href="#/shop" '+(!query.category?'aria-current="page"':'')+'>All</a>'+categoryLinks+'</nav>'+
  (active?'<div class="shop-results-head"><div><p class="shop-overline">FILTERED CLASSES</p><h2>Search results</h2></div><div class="shop-results-meta">'+(lessons.length+bundles.length)+' found</div></div><div class="shop-active-filters">'+activeChips+'<button type="button" class="shop-clear" data-shop-clear="1">Clear all</button></div><div class="shop-results-grid">'+(results||'<p class="shop-empty">No lessons match these filters. Try changing your selection.</p>')+'</div>':
  categories.map(shelf).join('')||'<p class="shop-empty">Classes will appear here once the school library is published.</p>')+
  '<div class="shop-course-link"><div><span>THE COMPLETE COURSE</span><h2>WANT IT ALL? THE FULL COURSE IS A BETTER DEAL.</h2></div><a class="btn btn-red" href="#/course">See course</a></div>'+
  '<section class="shop-faq"><p class="shop-overline">QUESTIONS</p><h2>Good to know</h2>'+faq([
   ['How do I access a class?','Purchased lessons appear in your account after payment has been verified.'],
   ['Do I need a pole?','Each lesson lists its equipment. Some can be done on the floor or with another stable support.'],
   ['Can I buy a bundle instead?','Yes. Available bundles group individual lessons into one purchase.']])+'</section></div></div></section>'
 );
}
function lesson(route){const l=state.lessons.find(x=>x.id===getId(route));if(!l)return layout(section('Lesson not found','<p>Return to the library.</p>'+btn('CLASSES','shop')));layout(section('','<p class="eyebrow"><a href="#/shop">CLASSES</a> / '+esc(l.category)+' / '+esc(l.title)+'</p><div class="grid grid-2"><div>'+'<div class="lesson-detail-cover"><span>SVITLANA YURCHAK / CLASS LIBRARY</span><strong>MOVE WITH INTENTION.</strong><span>TECHNIQUE · CONTROL · FLOW</span></div>'+'<p class="description">Video is provided only when you have access.</p></div><div><h1 style="font-size:clamp(2.6rem,5vw,5rem)">'+esc(l.title)+'</h1><p>'+esc(l.level)+' · '+l.duration+' minutes · '+esc(l.category)+'</p><p class="price">'+(l.free?'FREE':money(l.price))+'</p><div class="row"><button class="btn btn-red" data-watch="'+l.id+'">WATCH LESSON ▶</button>'+(l.free?'':'<button class="btn btn-outline" data-cart="'+l.id+'">ADD TO BAG</button>')+'</div><p class="description">Practice guidance and downloadable materials will be published by your teacher.</p></div></div><div id="playerMount" style="margin-top:35px"></div>','LESSON DETAIL')+section('PART OF LEGWORK LAB','<p>Get access to the full program and a structured learning journey.</p>'+btn('EXPLORE THE COURSE','course'),'CONTINUE LEARNING','muted-section'))}
function mentorship(){
 layout(
 '<section class="ref-mentor-hero"><div class="ref-wrap"><p class="eyebrow" data-no-i18n>'+editorial('mentorship','eyebrow')+'</p><h1 data-no-i18n>'+editorial('mentorship','headline')+'</h1><p data-no-i18n>'+editorial('mentorship','intro')+'</p><a class="btn btn-red" href="#/mentorship#request" data-no-i18n>'+editorial('mentorship','cta')+'</a></div></section>'+
 section('Meet your mentor','<div class="ref-mentor-intro">'+mediaFigure('portrait','mentor-photo')+'<div><h3>Svitlana Yurchak</h3><p>Exotic pole artist, international coach and creator of the Flexi Legs technique.</p><p>Teaching and judging experience at international pole events.</p></div></div>')+
 section('Choose a review','<div class="ref-prices"><div class="price-card"><span class="mentor-package-tag">QUICK FEEDBACK</span><h3>Basic</h3><p>A focused review of your video, with clear technique notes and next steps.</p><p class="mentor-price-status">Price confirmed before payment</p><a class="btn btn-dark" href="#/mentorship#request" data-package="Basic">Choose Basic</a></div><div class="price-card featured"><span class="mentor-package-tag">DETAILED BREAKDOWN</span><h3>Deep</h3><p>A detailed breakdown that considers your experience, training goals and specific questions.</p><p class="mentor-price-status">Price confirmed before payment</p><a class="btn btn-red" href="#/mentorship#request" data-package="Deep">Choose Deep</a></div></div>','','muted-section')+
 section('How it works','<div class="mentor-steps"><div><span>01</span><strong>Choose a format</strong></div><div><span>02</span><strong>Share your video</strong></div><div><span>03</span><strong>Confirm the request & payment</strong></div><div><span>04</span><strong>Receive your private feedback</strong></div></div>','FOUR SIMPLE STEPS')+
  '<section class="section" id="request"><div class="section-inner"><h2>Request feedback</h2><p class="mentorship-form-intro">Choose your package and share a link to the video you want reviewed.</p><div class="auth-panel ref-mentor-form"><form class="form" id="mentorshipForm"><label>Package<select name="package" id="mentorshipPackage"><option>Basic</option><option>Deep</option></select></label><label>Video link<input class="field" required name="video_url" type="url" placeholder="https://youtube.com/..."></label><label>Instagram handle<input class="field" name="instagram" placeholder="@username"></label><label>What would you like help with?<textarea rows="3" name="goals" placeholder="For example: leg lines or transitions"></textarea></label><div class="stack hidden" id="deepFields"><label>Your dance experience<textarea rows="3" name="experience" placeholder="How long have you been dancing?"></textarea></label><label>Training frequency<select name="training_frequency"><option value="">Select</option><option>Once a week</option><option>2–3 times a week</option><option>4+ times a week</option></select></label><label>Do you teach?<select name="teaching"><option value="">Select</option><option>No</option><option>Yes</option></select></label></div><p class="notice">This sends a request, not a payment. Timing and price will be confirmed before you pay.</p><button class="btn btn-red" type="submit">Send request</button></form></div></div></section>'+
 section('Your review, explained','<div class="mentor-example"><div class="mentor-example-screen" aria-hidden="true"><span>TECHNIQUE<br>NOTES.</span></div><div><p class="eyebrow">A USEFUL NEXT STEP</p><h3>Not a score. A direction.</h3><p>Your mentor can help you understand what to adjust, which technique to practise and where to focus next. Your actual response appears privately in your account.</p></div></div>','','muted-section')+
  section('Questions',faq([['When will I receive feedback?','The response time is confirmed before payment.'],['Who can see my video?','Only authorized school staff can access the submitted link. Check the sharing settings with your video host.']]),'','muted-section')
 );
 const chosen=sessionStorage.getItem('legwork_package')||'Basic';
 const sel=$('#mentorshipPackage');
 if(sel){sel.value=chosen;$('#deepFields')?.classList.toggle('hidden',chosen!=='Deep')}
}
function authPage(register=false){layout(section(register?'CREATE AN ACCOUNT':'WELCOME BACK','<div class="auth-panel"><form class="form" id="authForm"><input type="hidden" name="mode" value="'+(register?'register':'login')+'">'+(register?'<label>Full name<input class="field" required name="name" autocomplete="name"></label>':'')+'<label>'+ (register?'Email':'Email or Admin')+'<input class="field" required name="email" '+(register?'type="email"':'type="text"')+' autocomplete="username"></label><label>Password<input class="field" required type="password" name="password" minlength="'+(register?12:1)+'" autocomplete="'+(register?'new-password':'current-password')+'"></label><button class="btn btn-red" type="submit">'+(register?'SIGN UP':'LOG IN')+'</button><p class="description">'+(register?'Already have an account? <a href="#/login">Log in</a>':'New to the school? <a href="#/register">Create an account</a> · <a href="#/forgot-password">Forgot password?</a>')+'</p></form></div>','YOUR PERSONAL LEARNING SPACE','muted-section'))}
function forgotPasswordPage(){
 layout(section('RESET YOUR PASSWORD','<div class="auth-panel"><p class="description">Enter your account email. If the address is registered, we will send a secure reset link. The link expires in 30 minutes.</p><form id="forgotPasswordForm" class="form"><label>Email address<input class="field" type="email" name="email" autocomplete="email" required></label><button class="btn btn-red">SEND RESET LINK</button><a href="#/login">← Back to login</a></form></div>','ACCOUNT RECOVERY','muted-section'));
}
function resetPasswordPage(token){
 if(!/^[a-f0-9]{64}$/.test(token))return layout(section('INVALID RESET LINK','<p>This password reset link is invalid.</p>'+btn('REQUEST A NEW LINK','forgot-password')));
 layout(section('CHOOSE A NEW PASSWORD','<div class="auth-panel"><form id="resetPasswordForm" class="form"><label>New password (at least 12 characters)<input class="field" type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Confirm new password<input class="field" type="password" name="confirm_password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button class="btn btn-red">RESET PASSWORD</button></form></div>','SECURE ACCOUNT RECOVERY','muted-section'));
}
async function verifyEmailPage(token){
 if(!/^[a-f0-9]{64}$/.test(token))return layout(section('INVALID VERIFICATION LINK','<p>The link is invalid.</p>'+btn('MY ACCOUNT','account')));
 try{
  const r=await api('/auth/verify-email','POST',{token});
  layout(section('EMAIL CONFIRMED','<p class="description">'+esc(r.message)+'. You can now purchase courses and request mentorship.</p>'+btn('GO TO MY ACCOUNT','account'),'WELCOME TO LEGWORK','muted-section'));
 }catch(e){layout(section('VERIFICATION FAILED','<p class="description">'+esc(e.message)+'</p><p>Request another link from your account if this one has expired or has already been used.</p>'+btn('MY ACCOUNT','account'),'EMAIL CONFIRMATION','muted-section'))}
}

async function account(){if(!state.user)return authPage(false);const expectedHash=location.hash;const [d,achievement,homeworkReviews,paymentConfig,paymentHistory,emailStatus,certificateData]=await Promise.all([api('/dashboard'),api('/account/achievements'),api('/account/homework-reviews'),api('/payments/config'),api('/payments/mine'),api('/account/email-status'),api('/account/certificates')]);if(location.hash!==expectedHash)return;state.dashboard=d;const completed=d.progress.filter(x=>x.completed).length,owned=state.lessons.filter(l=>l.free||d.enrollments.some(c=>c.id===l.course_id)||d.lessonAccess.includes(l.id));const nextOwned=owned.find(l=>!d.progress.some(p=>p.lesson_id===l.id&&p.completed))||owned[0];const tab=state.tab;const nav=['overview','lessons','reviews','achievements','profile',...(state.user.role==='admin'?['admin']:[])];let body='';
if(tab==='overview'){
 const percent=owned.length?Math.round(completed/owned.length*100):0;
 const ownedCourses=d.enrollments.map(c=>'<a class="account-course" href="#/course"><div class="account-course-cover"><span>LEGWORK / ONLINE SCHOOL</span><strong>'+esc(c.title)+'</strong><span>YOUR PERSONAL PRACTICE</span></div><div class="account-course-info"><span>'+(c.tier==='guru'?'GURU · WITH FEEDBACK':'SELF-PACED')+'</span><div class="progress-bar"><i style="width:'+percent+'%"></i></div><small>'+percent+'% COMPLETE</small></div></a>').join('');
 const feedbackSummary=d.mentorships.slice(0,2).map(m=>'<div class="account-feedback-entry"><div class="account-feedback-visual"><span>PRIVATE<br>FEEDBACK</span></div><div><strong>'+esc(m.package)+' REVIEW</strong><p>'+esc(m.feedback||'Waiting for your mentor’s response.')+'</p><span class="badge-label">'+esc(m.status)+'</span></div></div>').join('')||'<p class="description">Your personal reviews will appear here. <a href="#/mentorship">Explore mentorship</a></p>';
 body='<h2>HI, '+esc(state.user.name).toUpperCase()+'!</h2><div class="account-continue"><div class="account-continue-art"><span>LEGWORK</span><strong>LIKE A<br>BOSS.</strong></div><div class="account-continue-content"><p class="eyebrow">CONTINUE YOUR PRACTICE</p><h3>'+(nextOwned?esc(nextOwned.title):'Your next lesson awaits')+'</h3><div class="progress-bar"><i style="width:'+percent+'%"></i></div><small>'+percent+'% OF ACCESSIBLE LESSONS COMPLETE</small></div>'+(nextOwned?'<a class="btn btn-red" href="#/study/'+nextOwned.id+'">CONTINUE</a>':btn('EXPLORE LESSONS','shop'))+'</div>'+
 '<div class="account-section-head"><h3>MY COURSES & LESSONS</h3><button data-tab="lessons" class="tiny-link">VIEW ALL</button></div><div class="grid grid-3 account-course-grid">'+(ownedCourses||'<p class="description">No courses purchased yet. <a href="#/course">Discover Legwork Lab</a></p>')+'</div>'+
 '<div class="grid grid-2 account-panels"><div><div class="account-section-head"><h3>MY VIDEO REVIEWS</h3><button class="tiny-link" data-tab="reviews">VIEW ALL</button></div>'+feedbackSummary+'</div><div><div class="account-section-head"><h3>ACHIEVEMENTS</h3><button class="tiny-link" data-tab="achievements">VIEW ALL</button></div><div class="account-achievements"><div><strong>'+achievement.streak+'</strong><span>DAY STREAK</span></div><div><strong>'+achievement.badges.length+'</strong><span>TECHNIQUE BADGES</span></div><div><strong>'+achievement.completed+'</strong><span>LESSONS COMPLETED</span></div></div></div></div>'+
 '<div class="account-section-head"><h3>MY ORDERS</h3></div>'+(d.orders.map(o=>'<div class="item-row">'+esc(o.kind)+' #'+o.item_id+' · '+money(o.amount)+' · '+esc(o.plan||'self')+' · <b>'+esc(o.status)+'</b></div>').join('')||'<p class="description">No orders yet.</p>');
}
if(tab==='overview'&&emailStatus.verification_required&&!emailStatus.verified)body='<div class="notice" role="alert"><b>Confirm your email address</b><p>We sent a verification link to '+esc(emailStatus.email)+'. Verify your email before buying classes or requesting mentorship. The link expires after 24 hours.</p><button type="button" id="resendVerification" class="btn btn-outline btn-small">RESEND VERIFICATION EMAIL</button></div>'+body;
if(tab==='overview')body+='<h3 style="margin-top:36px">PAYMENT CHECKOUT</h3>'+orderSelectionMarkup(d.orders,paymentConfig)+'<h3 style="margin-top:32px">PAYMENT HISTORY</h3>'+paymentHistoryMarkup(paymentHistory.payments,paymentConfig);
if(tab==='lessons')body='<h2>MY LESSONS</h2><div class="grid grid-3">'+owned.map(l=>lessonCard(l,true)).join('')+'</div>';
if(tab==='reviews')body='<h2>MY VIDEO REVIEWS</h2>'+(d.mentorships.map(m=>'<div class="item-row"><span class="badge-label">'+esc(m.status)+'</span><h3>'+esc(m.package)+'</h3><a href="'+esc(m.video_url)+'" target="_blank" rel="noopener noreferrer">Your video</a><p>'+esc(m.feedback||'Your mentor has not replied yet.')+'</p></div>').join('')||'<p class="empty">No mentorship requests yet. <a href="#/mentorship">Explore mentorship</a></p>')+'<h3>HOMEWORK FEEDBACK</h3>'+(homeworkReviews.reviews.map(r=>'<div class="item-row"><h3>'+esc(r.title)+'</h3><p>'+esc(r.feedback)+'</p><p class="meta">'+esc(r.reviewed_at)+'</p></div>').join('')||'<p class="description">No homework reviews yet.</p>');
if(tab==='achievements')body='<h2>YOUR ACHIEVEMENTS</h2><div class="grid grid-3">'+card(achievement.completed+' lessons completed','Keep practicing, each session counts.','PROGRESS')+card(achievement.streak+' day streak','Open an accessible lesson or submit homework daily.','CONSISTENCY')+card(achievement.badges.length+' technique badges','Finish a lesson and attach homework to earn a badge.','BADGES')+'</div><h3>BADGE COLLECTION</h3><div class="grid grid-3">'+(achievement.badges.map(b=>card(b.title,'Unlocked','★ BADGE')).join('')||'<p>No badges yet.</p>')+'</div><h3>COURSE CERTIFICATES</h3>'+studentCertificatesMarkup(certificateData.certificates);
if(tab==='profile')body='<h2>PROFILE</h2><form class="form auth-panel" id="profileForm"><label>Your name<input name="name" class="field" required value="'+esc(state.user.name)+'"></label><label>Instagram username<input name="instagram" class="field" value="'+esc(state.user.instagram||'')+'"></label><label>Email<input class="field" disabled value="'+esc(state.user.email)+'"></label><button class="btn btn-red">SAVE PROFILE</button></form><h3 style="margin-top:35px">CHANGE PASSWORD</h3><form class="form auth-panel" id="passwordForm"><label>Current password<input class="field" type="password" autocomplete="current-password" name="current_password" required></label><label>New password (12+ characters)<input class="field" type="password" minlength="12" autocomplete="new-password" name="new_password" required></label><button class="btn btn-outline">CHANGE PASSWORD</button></form><button class="btn btn-outline" id="logout">LOG OUT</button>';
if(tab==='admin')body='<h2>ADMIN STUDIO</h2><p>Manage course access, lesson links and mentorship requests.</p><div id="adminMount"><p>Loading admin data…</p></div>';
layout('<div class="cabinet"><aside class="cabinet-nav">'+nav.map(n=>'<button data-tab="'+n+'" class="'+(n===tab?'active':'')+'">'+n.charAt(0).toUpperCase()+n.slice(1)+'</button>').join('')+'</aside><div class="cabinet-main">'+body+'</div></div>');if(tab==='admin')adminPanel()}
async function adminPanel(){try{const a=state.admin=await api('/admin/overview');$('#adminMount').innerHTML='<div class="grid grid-3">'+card(a.users.length+' USERS','Registered profiles','PEOPLE')+card(a.orders.filter(o=>o.status==='pending').length+' PENDING','Requires independent payment verification','ORDERS')+card(a.mentorships.filter(x=>x.status==='paid').length+' TO REVIEW','Paid requests awaiting feedback','MENTORSHIP')+'</div><h3>Purchase requests</h3><div class="stack">'+(a.orders.map(o=>'<div class="item-row row"><span>#'+o.id+' · '+esc(o.email)+' · '+esc(o.kind)+' '+o.item_id+' · '+money(o.amount)+' · '+o.status+'</span>'+(o.status==='pending'?'<button class="btn btn-small btn-outline" data-approve="'+o.id+'">APPROVE AFTER PAYMENT</button>':'')+'</div>').join('')||'<p>No orders yet.</p>')+'</div><h3>Give a student course access</h3><form id="enrollForm" class="form"><select name="user_id" required>'+a.users.filter(x=>x.role==='student').map(u=>'<option value="'+u.id+'">'+esc(u.email)+'</option>').join('')+'</select><select name="course_id">'+a.courses.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('')+'</select><button class="btn btn-dark">GRANT ACCESS</button></form><h3>Add a course</h3><form id="courseForm" class="form"><input class="field" name="title" placeholder="Course title" required><input class="field" name="slug" placeholder="course-url-slug" required><textarea class="field" name="description" placeholder="Description"></textarea><input class="field" type="number" min="0" name="price" placeholder="Price in cents"><button class="btn btn-dark">ADD COURSE</button></form><h3>Add a lesson</h3><form id="lessonForm" class="form"><select name="course_id">'+a.courses.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('')+'</select><input class="field" name="title" placeholder="Lesson title" required><input class="field" name="category" placeholder="Category" value="Legwork"><input class="field" name="level" placeholder="Level" value="Beginner"><input class="field" name="video_url" type="url" placeholder="Private lesson video URL"><input class="field" name="cover_url" type="url" placeholder="Public lesson cover image URL (https://)"><input class="field" name="price" type="number" placeholder="Price in cents" min="0"><label><input name="free" type="checkbox"> Free lesson</label><button class="btn btn-dark">ADD LESSON</button></form><h3>Edit lesson videos</h3><div class="stack">'+a.lessons.map(l=>'<form class="item-row form" data-edit-lesson="'+l.id+'"><b>'+esc(l.title)+'</b><input class="field" type="url" name="video_url" value="'+esc(l.video_url||'')+'" placeholder="Video URL"><label><input type="checkbox" name="free" '+(l.free?'checked':'')+'> Free</label><button class="btn btn-small btn-outline">UPDATE LESSON</button></form>').join('')+'</div><h3>Mentorship reviews</h3><div class="stack">'+(a.mentorships.map(m=>'<div class="item-row"><h3>'+esc(m.package)+' · '+esc(m.email)+' · '+esc(m.status)+'</h3><p><a target="_blank" rel="noopener noreferrer" href="'+esc(m.video_url)+'">View video</a></p><p>'+esc(m.goals)+'</p>'+(m.status==='awaiting_payment'?'<button class="btn btn-small btn-outline" data-pay="'+m.id+'">MARK PAYMENT VERIFIED</button>':'<form class="form" data-feedback="'+m.id+'"><textarea name="feedback" required>'+esc(m.feedback)+'</textarea><button class="btn btn-small btn-red">SEND FEEDBACK TO ACCOUNT</button></form>')+'</div>').join('')||'<p>No requests yet.</p>')+'</div>';await adminExtras(a);await adminBundlePanel(a);await adminPaymentPanel();await adminMailPanel();await adminCertificatePanel();await adminEditorialPanel();translatePage($('#adminMount'),state.lang)}catch(e){if($('#adminMount'))$('#adminMount').textContent=e.message}}

async function adminCertificatePanel(){const data=await api('/admin/certificates');const root=$('#adminMount');if(root)root.insertAdjacentHTML('beforeend',adminCertificatesMarkup(data))}
async function adminEditorialPanel(){const r=await api('/admin/content');const mount=$('#adminMount');if(mount)mount.insertAdjacentHTML('beforeend',editorialEditor(r))}
async function adminExtras(a){
 const [homework,waitlist]=await Promise.all([api('/admin/homework'),api('/admin/waitlist')]);
 const root=$('#adminMount');if(!root)return;
 const editCourses='<h3>EDIT COURSES · PRICING & DESCRIPTION</h3><div class="stack">'+a.courses.map(c=>'<details class="item-row"><summary><b>'+esc(c.title)+'</b> · '+money(c.price)+'</summary><form class="form" data-course-edit="'+c.id+'"><label>Title<input class="field" name="title" required value="'+esc(c.title)+'"></label><label>Slug<input class="field" name="slug" required value="'+esc(c.slug)+'"></label><label>Description<textarea class="field" name="description">'+esc(c.description)+'</textarea></label><label>Price in US cents<input class="field" type="number" name="price" min="0" required value="'+c.price+'"></label><label>Guru package price (USD cents)<input class="field" type="number" name="guru_price" min="0" required value="'+c.guru_price+'"></label><button class="btn btn-dark">SAVE COURSE</button></form></details>').join('')+'</div>';
 const editLessons='<h3>EDIT FULL LESSON DETAILS</h3><p class="description">Expand a lesson to change its name, category, level, duration, price and video.</p><div class="stack">'+a.lessons.map(l=>'<details class="item-row"><summary>'+esc(l.title)+'</summary><form class="form" data-lesson-full="'+l.id+'"><label>Title<input class="field" name="title" required value="'+esc(l.title)+'"></label><div class="grid grid-2"><label>Category<input class="field" name="category" required value="'+esc(l.category)+'"></label><label>Type<input class="field" name="kind" required value="'+esc(l.kind)+'"></label><label>Level<input class="field" name="level" required value="'+esc(l.level)+'"></label><label>Duration in minutes<input class="field" name="duration" type="number" min="1" max="600" required value="'+l.duration+'"></label></div><label>Price in cents<input class="field" name="price" type="number" min="0" required value="'+l.price+'"></label><div class="grid grid-2"><label>Teacher<input class="field" name="teacher" value="'+esc(l.teacher||'Svitlana Yurchak')+'"></label><label>Equipment<input class="field" name="equipment" value="'+esc(l.equipment||'Any support')+'"></label><label>Training focus (comma-separated)<input class="field" name="focus" placeholder="Feet, Strength" value="'+esc(l.focus||'')+'"></label><label>Hashtags (comma-separated)<input class="field" name="tags" placeholder="#kneecircle" value="'+esc(l.tags||'')+'"></label></div><label>Private video URL<input class="field" name="video_url" type="url" value="'+esc(l.video_url||'')+'"></label><label>Public cover image URL<input class="field" name="cover_url" type="url" placeholder="https://" value="'+esc(l.cover_url||'')+'"></label><label><input name="free" type="checkbox" '+(l.free?'checked':'')+'> Introductory free lesson (account required)</label><button class="btn btn-dark">SAVE LESSON</button></form></details>').join('')+'</div>';
 const homeworkCards='<h3>GURU HOMEWORK REVIEW QUEUE</h3><p class="description">Only assignments from students with the Guru package appear here.</p><div class="stack">'+(homework.homework.map(h=>'<div class="item-row"><p class="eyebrow">'+esc(h.course)+' · '+esc(h.email)+'</p><h3>'+esc(h.lesson)+'</h3><a href="'+esc(h.homework_url)+'" target="_blank" rel="noopener noreferrer">VIEW HOMEWORK</a><p class="meta">'+(h.reviewed_at?'Answered: '+esc(h.reviewed_at):'Awaiting review')+'</p><form class="form" data-homework-review="'+h.user_id+'-'+h.lesson_id+'"><label>Feedback<textarea class="field" rows="4" name="feedback" required>'+esc(h.feedback||'')+'</textarea></label><button class="btn btn-red">SAVE FEEDBACK</button></form><div class="row" style="margin-top:12px"><span class="badge-label">'+(h.approved?'APPROVED':'AWAITING APPROVAL')+'</span>'+(h.feedback?'<button type="button" class="btn btn-outline btn-small" data-homework-approval="'+h.user_id+'-'+h.lesson_id+'" data-approved="'+(h.approved?'false':'true')+'">'+(h.approved?'REVOKE APPROVAL':'APPROVE HOMEWORK')+'</button>':'')+'</div></div>').join('')||'<p class="empty">No Guru homework submissions yet.</p>')+'</div>';
 const leadList='<h3>WAITLIST SIGNUPS</h3><div class="stack">'+(waitlist.entries.map(x=>'<div class="item-row row"><b>'+esc(x.email)+'</b><span>'+esc(x.purpose)+' · '+esc(x.consent_at)+'</span></div>').join('')||'<p class="description">No subscribers yet.</p>')+'</div>';
 root.insertAdjacentHTML('beforeend',editCourses+editLessons+homeworkCards+leadList);
}

async function adminMailPanel(){
 const response=await api('/admin/email-outbox');
 const root=$('#adminMount');if(!root)return;
 const values=Object.fromEntries(response.stats.map(x=>[x.status,x.n]));
 root.insertAdjacentHTML('beforeend','<h3>EMAIL DELIVERY HEALTH</h3><div class="grid grid-3">'+card('Email '+(response.enabled?'READY':'NOT CONFIGURED'),'SMTP configuration is stored on the server; passwords and message text are never shown here.','DELIVERY')+card(String(values.sent||0)+' SENT','Emails delivered successfully to the configured mail transport.','OUTBOX')+card(String(values.pending||0)+' PENDING / '+String(values.failed||0)+' FAILED','Unsent emails are retried by the server up to eight attempts.','QUEUE')+'</div>');
}
async function adminPaymentPanel(){
 const response=await api('/admin/payments');
 const root=$('#adminMount');if(!root)return;
 const rows=response.payments.map(p=>'<div class="item-row row"><div><b>'+esc(p.reference)+'</b><p class="meta">'+esc(p.email)+' · '+esc(p.status.toUpperCase())+' · '+(p.uah_kopecks/100).toFixed(2)+' UAH</p></div><a class="btn btn-small btn-outline" href="#/payment/'+p.id+'">VIEW STATUS</a></div>').join('');
 root.insertAdjacentHTML('beforeend','<h3>PAYMENT RECONCILIATION</h3><p class="description">Status is verified from WayForPay webhook signatures. A customer return URL never confirms payment. Review refunds and disputes outside this dashboard before revoking access.</p><div class="stack">'+(rows||'<p>No online payment attempts.</p>')+'</div>');
}
async function adminBundlePanel(a){
 const response=await api('/admin/bundles');
 const optionList=selected=>a.lessons.map(l=>'<option value="'+l.id+'" '+(selected.includes(l.id)?'selected':'')+'>'+esc(l.title)+' · '+esc(l.category)+'</option>').join('');
 const fields=(bundle=null)=>{
  const b=bundle||{title:'',slug:'',description:'',direction:'Legwork',price:'',original_price:'',lesson_ids:[],active:true};
  return '<label>Bundle title<input class="field" name="title" required value="'+esc(b.title)+'"></label>'+
   '<label>URL slug<input class="field" name="slug" required value="'+esc(b.slug)+'" placeholder="legwork-foundations"></label>'+
   '<label>Direction<input class="field" name="direction" required value="'+esc(b.direction)+'"></label>'+
   '<label>Description<textarea class="field" name="description">'+esc(b.description)+'</textarea></label>'+
   '<div class="grid grid-2"><label>Sale price · USD cents<input class="field" type="number" min="0" name="price" required value="'+b.price+'"></label><label>Original price · USD cents<input class="field" type="number" min="0" name="original_price" required value="'+b.original_price+'"></label></div>'+
   '<label>Select 2–30 lessons (hold Command or Ctrl to choose multiple)<select class="field" name="lesson_ids" size="9" multiple required>'+optionList(b.lesson_ids)+'</select></label>'+
   (bundle?'<label><input name="active" type="checkbox" '+(b.active?'checked':'')+'> Visible in the public shop</label>':'');
 };
 const bundles=response.bundles.map(b=>'<details class="item-row"><summary><b>'+esc(b.title)+'</b> · '+money(b.price)+' · '+(b.active?'VISIBLE':'HIDDEN')+'</summary><form class="form" data-bundle-edit="'+b.id+'">'+fields(b)+'<button class="btn btn-dark">SAVE BUNDLE</button></form></details>').join('');
 const root=$('#adminMount');if(!root)return;
 root.insertAdjacentHTML('beforeend','<h3>LESSON BUNDLES · SHOP</h3><p class="description">Combine elements, preparation and warm-up into a discounted package. Sold bundle membership becomes immutable.</p><div class="stack">'+(bundles||'<p>No bundles created yet.</p>')+'</div><h3>CREATE A BUNDLE</h3><form class="form" id="bundleCreateForm">'+fields()+'<button class="btn btn-red">CREATE BUNDLE</button></form>');
}
function parseYouTube(url){try{const u=new URL(url);let id='';if(['youtu.be','www.youtu.be'].includes(u.hostname))id=u.pathname.slice(1);else if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname))id=u.searchParams.get('v')||u.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1]||'';return /^[\w-]{11}$/.test(id)?id:null}catch{return null}}
let cartPreviousFocus=null;
function setMobileMenu(open){
 const nav=$('#nav'),toggle=$('#menuBtn');
 nav.classList.toggle('open',open);
 toggle.setAttribute('aria-expanded',String(open));
 toggle.setAttribute('aria-label',open?(state.lang==='es'?'Cerrar menú de navegación':'Close navigation menu'):(state.lang==='es'?'Abrir menú de navegación':'Open navigation menu'));
}
function showCart(){
 const lessons=state.cart.map(id=>state.lessons.find(l=>l.id===id)).filter(Boolean);
 const bundles=state.bundleCart.map(id=>state.bundles.find(b=>b.id===id)).filter(Boolean);
 const total=lessons.reduce((sum,l)=>sum+l.price,0)+bundles.reduce((sum,b)=>sum+b.price,0);
 const lessonRows=lessons.map(l=>'<div class="item-row row"><div><b>'+esc(l.title)+'</b><p>Lesson · '+money(l.price)+'</p></div><button class="btn btn-small btn-outline" data-remove="'+l.id+'">REMOVE</button></div>').join('');
 const bundleRows=bundles.map(b=>'<div class="item-row row"><div><b>'+esc(b.title)+'</b><p>Bundle · '+b.lesson_ids.length+' lessons · '+money(b.price)+'</p></div><button class="btn btn-small btn-outline" data-remove-bundle="'+b.id+'">REMOVE</button></div>').join('');
 $('#cartBody').innerHTML=(lessons.length+bundles.length)?lessonRows+bundleRows+'<h3>'+translateText('Total:',state.lang)+' '+money(total)+'</h3><button class="btn btn-red" id="requestCart">REQUEST PURCHASE</button><p class="description">Purchase requests are manual. No money is charged at this stage.</p>':'<p>Your bag is empty.</p>';translatePage($('#cartDrawer'),state.lang);
 cartPreviousFocus=document.activeElement;
 const drawer=$('#cartDrawer');drawer.inert=false;drawer.classList.add('open');
 $('#shade').hidden=false;$('#cartBtn').setAttribute('aria-expanded','true');
 $('#closeCart').focus();
}
function closeCart(restoreFocus=true){const drawer=$('#cartDrawer'),wasOpen=drawer.classList.contains('open');$('#shade').hidden=true;drawer.classList.remove('open');drawer.inert=true;$('#cartBtn').setAttribute('aria-expanded','false');if(wasOpen&&restoreFocus){const target=cartPreviousFocus?.isConnected?cartPreviousFocus:$('#cartBtn');target?.focus()}cartPreviousFocus=null}
function updateCart(){localStorage.setItem('legwork_cart',JSON.stringify(state.cart));localStorage.setItem('legwork_bundle_cart',JSON.stringify(state.bundleCart));syncHeader()}
async function navigate(){closeCart(false);setMobileMenu(false);window.scrollTo(0,0);const route=(location.hash.startsWith('#/')?location.hash.slice(2):location.pathname.replace(/^\//,'')).split('?')[0];try{if(route==='')home();else if(route==='course'||route.startsWith('course#'))course();else if(route==='shop')shop();else if(route.startsWith('lesson/'))lesson(route);else if(route.startsWith('bundle/'))bundlePage(route);else if(route.startsWith('verify-certificate/'))await verifyCertificateView(route.split('/')[1],{api,layout});else if(route.startsWith('payment/')){if(!state.user)authPage(false);else await renderPaymentStatus(Number(route.split('/')[1]),{api,layout,notice})}else if(route.startsWith('study/')){if(!state.user)authPage(false);else await renderStudy(Number(route.split('/')[1]),{api,layout,notice,lang:state.lang})}else if(route.startsWith('mentorship'))mentorship();else if(route==='forgot-password')forgotPasswordPage();else if(route.startsWith('reset-password/'))resetPasswordPage(route.split('/')[1]);else if(route.startsWith('verify-email/'))await verifyEmailPage(route.split('/')[1]);else if(route==='login')authPage();else if(route==='register')authPage(true);else if(route==='account')await account();else home();if(location.hash.includes('#prices')||location.hash.includes('#request'))setTimeout(()=>document.getElementById(location.hash.split('#').pop())?.scrollIntoView({behavior:'smooth'}),50)}catch(e){if(location.hash==='#/'+route||location.hash.startsWith('#/'+route+'?'))layout(section('Unable to load',esc(e.message)));}}
async function init(){try{const [me,courses,lessons,bundles,content]=await Promise.all([api('/me'),api('/courses'),api('/lessons'),api('/bundles'),api('/content')]);state.user=me.user;state.courses=courses.courses;state.lessons=lessons.lessons;state.bundles=bundles.bundles;state.content=content.pages;await navigate()}catch(e){layout(section('Connection error','<p>'+esc(e.message)+'</p>'))}}
const formData=form=>Object.fromEntries(new FormData(form));
async function action(e){const target=e.target,form=target.closest('form'),button=target.closest('button,a');try{
if(form&&e.type==='submit'){e.preventDefault();const data=formData(form);
if(form.id==='forgotPasswordForm'){const response=await api('/auth/forgot-password','POST',{email:data.email});notice(response.message);form.reset();return}
else if(form.id==='resetPasswordForm'){
 if(data.password!==data.confirm_password){notice('Passwords do not match');return}
 const token=location.hash.split('/').pop();
 const response=await api('/auth/reset-password','POST',{token,password:data.password});
 state.user=null;state.tab='overview';location.hash='#/login';await navigate();notice(response.message);return
}
else if(form.id==='authForm'){const r=await api('/auth/'+data.mode,'POST',data);state.user=r.user;state.tab='overview';location.hash='#/account';await navigate()}
else if(form.id==='mentorshipForm'){if(!state.user){location.hash='#/login';notice('Log in before sending a mentorship request');return}const r=await api('/mentorships','POST',data);notice(r.message);location.hash='#/account'}
else if((form.id==='subscribeForm'||form.id==='footerSubscribeForm')){const r=await api('/subscribe','POST',{email:data.email,purpose:data.purpose,consent:true});notice(r.message);form.reset()}
else if(form.id==='profileForm'){await api('/profile','PATCH',data);state.user.name=data.name;state.user.instagram=data.instagram;notice('Profile saved');await account()}
else if(form.id==='passwordForm'){const result=await api('/account/change-password','POST',data);state.user=null;state.tab='overview';location.hash='#/login';await navigate();notice(result.message)}
else if(form.dataset.editorPage){const page=form.dataset.editorPage,lang=form.dataset.editorLang,revision=Number(form.dataset.revision);await api('/admin/content/'+page+'/'+lang,'PUT',{values:data,expected_revision:revision});state.content=(await api('/content')).pages;notice('Page text updated for '+lang.toUpperCase());await adminPanel();return}
else if(form.id==='enrollForm'){await api('/admin/enroll','POST',{user_id:Number(data.user_id),course_id:Number(data.course_id)});notice('Access granted');await adminPanel()}
else if(form.id==='courseForm'){await api('/admin/courses','POST',{...data,price:Number(data.price)||0});state.courses=(await api('/courses')).courses;notice('Course created');await adminPanel()}
else if(form.id==='lessonForm'){await api('/admin/lessons','POST',{...data,course_id:Number(data.course_id),price:Number(data.price)||0,free:form.querySelector('[name=free]').checked});state.lessons=(await api('/lessons')).lessons;notice('Lesson created');await adminPanel()}
else if(form.dataset.editLesson){await api('/admin/lessons/'+form.dataset.editLesson,'PATCH',{video_url:data.video_url,free:form.querySelector('[name=free]').checked});notice('Lesson updated');await adminPanel()}
else if(form.dataset.feedback){await api('/admin/mentorships/'+form.dataset.feedback,'PATCH',{feedback:data.feedback});notice('Feedback sent to student account');await adminPanel()}
else if(form.dataset.courseEdit){await api('/admin/courses/'+form.dataset.courseEdit,'PATCH',{...data,price:Number(data.price),guru_price:Number(data.guru_price)});state.courses=(await api('/courses')).courses;notice('Course updated');await adminPanel()}
else if(form.dataset.lessonFull){await api('/admin/lessons/'+form.dataset.lessonFull+'/full','PATCH',{...data,price:Number(data.price),duration:Number(data.duration),free:form.querySelector('[name=free]').checked});state.lessons=(await api('/lessons')).lessons;notice('Lesson details updated');await adminPanel()}
else if(form.id==='bundleCreateForm'||form.dataset.bundleEdit){
 const lesson_ids=[...form.querySelector('[name="lesson_ids"]').selectedOptions].map(option=>Number(option.value));
 const payload={...data,price:Number(data.price),original_price:Number(data.original_price),lesson_ids};
 if(form.dataset.bundleEdit)payload.active=form.querySelector('[name="active"]').checked;
 const url=form.dataset.bundleEdit?'/admin/bundles/'+form.dataset.bundleEdit:'/admin/bundles';
 await api(url,form.dataset.bundleEdit?'PATCH':'POST',payload);
 state.bundles=(await api('/bundles')).bundles;
 notice('Bundle saved');await adminPanel()
}
else if(form.dataset.homeworkReview){const [uid,lid]=form.dataset.homeworkReview.split('-');const result=await api('/admin/homework/'+uid+'/'+lid+'/review','POST',{feedback:data.feedback});notice(result.message);await adminPanel()}return}
if(!button||e.type!=='click')return;
 if(button.id==='shopFiltersToggle'){const bar=$('#shopFilterBar'),open=bar.classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));button.querySelector('span').textContent=open?'−':'+';return}
if(button.dataset.showtab){e.preventDefault();document.querySelectorAll('[data-showtab]').forEach(el=>el.classList.toggle('active',el===button));const topics={championships:['CHAMPIONSHIPS','Competitions and performances across the international pole community.'],shows:['SHOWS','Stage performances and international dance appearances.'],judging:['JUDGING & POLECON','Experience teaching and judging at international events.']};const [title,body]=topics[button.dataset.showtab];const panel=$('#showsPanel');if(panel)panel.innerHTML='<h3>'+title+'</h3><p>'+body+'</p>';return}
if(button.dataset.message){e.preventDefault();notice(button.dataset.message)}
if(button.dataset.tab){state.tab=button.dataset.tab;await account()}
if(button.id==='resendVerification'){const answer=await api('/auth/resend-verification','POST',{});notice(answer.message);return}
if(button.id==='logout'){await api('/auth/logout','POST');state.user=null;state.tab='overview';location.hash='#/';await navigate()}
if(button.dataset.resumePayment){await resumeCheckout(Number(button.dataset.resumePayment),{api});return}
if(button.id==='beginPayment'){const ids=[...document.querySelectorAll('[data-pay-order]:checked')].map(el=>Number(el.value));if(!ids.length){notice('Select at least one pending order');return}await beginCheckout(ids,{api});return}
if(button.dataset.paymentRefresh){await renderPaymentStatus(Number(button.dataset.paymentRefresh),{api,layout,notice});return}
if(button.dataset.order){if(!state.user){location.hash='#/login';notice('Log in before requesting course access');return}const result=await api('/orders','POST',{kind:button.dataset.order,item_id:Number(button.dataset.id),plan:button.dataset.plan||'self'});notice(result.message);state.tab='overview';location.hash='#/account';await navigate();return}
if(button.dataset.cart){const id=Number(button.dataset.cart);if(state.bundleCart.some(bid=>state.bundles.find(b=>b.id===bid)?.lesson_ids.includes(id))){notice('This lesson is already included in a bundle in your bag');return}if(!state.cart.includes(id))state.cart.push(id);updateCart();notice('Lesson added to bag')}
if(button.dataset.cartBundle){const id=Number(button.dataset.cartBundle),b=state.bundles.find(x=>x.id===id);if(!b){notice('Bundle unavailable');return}if(state.bundleCart.includes(id)){showCart();return}if(state.bundleCart.some(bid=>state.bundles.find(x=>x.id===bid)?.lesson_ids.some(lid=>b.lesson_ids.includes(lid)))){notice('This bundle overlaps another bundle already in your bag');return}state.cart=state.cart.filter(lid=>!b.lesson_ids.includes(lid));state.bundleCart.push(id);updateCart();notice('Complete bundle added to bag')}
if(button.dataset.removeBundle){state.bundleCart=state.bundleCart.filter(id=>id!==Number(button.dataset.removeBundle));updateCart();showCart()}
if(button.dataset.remove){state.cart=state.cart.filter(id=>id!==Number(button.dataset.remove));updateCart();showCart()}
if(button.dataset.watch){if(!state.user){location.hash='#/login';notice('Create a free account or log in to watch lessons.');return}location.hash='#/study/'+Number(button.dataset.watch);return}

if(button.dataset.homeworkApproval){const [uid,lid]=button.dataset.homeworkApproval.split('-');const approved=button.dataset.approved==='true';if(!approved||askConfirmation('Confirm that this homework was personally reviewed and accepted?')){await api('/admin/homework/'+uid+'/'+lid+'/approve','POST',{approved});notice(approved?'Homework approved':'Approval withdrawn');await adminPanel()}return}
if(button.dataset.issueCertificate){const [user_id,course_id]=button.dataset.issueCertificate.split('-');if(askConfirmation('Issue a permanent certificate for this student? All lesson requirements have been approved.')){const result=await api('/admin/certificates/issue','POST',{user_id:Number(user_id),course_id:Number(course_id)});notice('Certificate issued: '+result.certificate.serial);await adminPanel()}return}
if(button.dataset.revokeCertificate){const reason=askReason('Reason for revoking this certificate (visible only to administrators):');if(reason===null)return;await api('/admin/certificates/'+button.dataset.revokeCertificate+'/revoke','POST',{reason});notice('Certificate revoked');await adminPanel();return}
if(button.dataset.approve){if(askConfirmation('Confirm payment was independently verified?')){await api('/admin/orders/'+button.dataset.approve+'/approve','POST');notice('Order approved');await adminPanel()}}
if(button.dataset.pay){if(askConfirmation('Confirm real payment verified outside the site?')){await api('/admin/mentorships/'+button.dataset.pay+'/verify-payment','POST');notice('Marked paid');await adminPanel()}}
if(button.dataset.category){location.hash='#/shop?category='+encodeURIComponent(button.dataset.category);await navigate()}
if(button.dataset.package){sessionStorage.setItem('legwork_package',button.dataset.package);setTimeout(()=>{const select=$('#mentorshipPackage');if(select){select.value=button.dataset.package;$('#deepFields')?.classList.toggle('hidden',button.dataset.package!=='Deep')}},0)}
if(button.id==='requestCart'){if(!state.user){location.hash='#/login';notice('Log in to request purchase');return}const items=state.cart.slice(),packages=state.bundleCart.slice();if(!items.length&&!packages.length){notice('Your bag is empty');return}const result=await api('/orders/batch','POST',{lesson_ids:items,bundle_ids:packages});state.cart=[];state.bundleCart=[];updateCart();closeCart();notice(result.message);location.hash='#/account'}
}catch(err){notice(err.message)}}
document.addEventListener('click',action);document.addEventListener('submit',async e=>{if(e.target.id==='progressForm'){e.preventDefault();try{const d=formData(e.target);await api('/progress/'+d.lesson_id,'POST',{completed:true,homework_url:d.homework_url});notice('Progress saved')}catch(err){notice(err.message)}return}action(e)});
$('#menuBtn').onclick=()=>setMobileMenu(!$('#nav').classList.contains('open'));
$('#nav').addEventListener('click',e=>{if(e.target.closest('a'))setMobileMenu(false)});
$('#cartBtn').onclick=showCart;$('#closeCart').onclick=()=>closeCart();$('#shade').onclick=()=>closeCart();
document.addEventListener('keydown',e=>{
 const drawer=$('#cartDrawer');
 if(e.key==='Escape'){
  if(drawer.classList.contains('open')){e.preventDefault();closeCart();return}
  if($('#nav').classList.contains('open')){setMobileMenu(false);$('#menuBtn').focus()}
 }
 if(e.key==='Tab'&&drawer.classList.contains('open')){
  const focusables=[...drawer.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length);
  if(!focusables.length){e.preventDefault();drawer.focus();return}
  const first=focusables[0],last=focusables.at(-1);
  if(e.shiftKey&&(document.activeElement===first||!drawer.contains(document.activeElement))){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&(document.activeElement===last||!drawer.contains(document.activeElement))){e.preventDefault();first.focus()}
 }
});$('#langBtn').onclick=()=>{state.lang=state.lang==='en'?'es':'en';localStorage.setItem('legwork_lang',state.lang);navigate()};
document.addEventListener('change',e=>{if(e.target.id==='mentorshipPackage'){$('#deepFields')?.classList.toggle('hidden',e.target.value!=='Deep');sessionStorage.setItem('legwork_package',e.target.value)}if(['filterCategory','filterLevel','filterKind','filterTeacher','filterEquipment','filterFocus','filterDuration'].includes(e.target.id)){const p=new URLSearchParams(location.hash.split('?')[1]||'');const key={filterCategory:'category',filterLevel:'level',filterKind:'kind',filterTeacher:'teacher',filterEquipment:'equipment',filterFocus:'focus',filterDuration:'duration'}[e.target.id];e.target.value?p.set(key,e.target.value):p.delete(key);location.hash='#/shop?'+p;}});document.addEventListener('keydown',e=>{if(e.target.id==='shopSearch'&&e.key==='Enter'){const p=new URLSearchParams(location.hash.split('?')[1]||'');e.target.value?p.set('q',e.target.value):p.delete('q');location.hash='#/shop?'+p}});document.querySelector('.skip-link')?.addEventListener('click',e=>{e.preventDefault();$('#app').focus()});window.addEventListener('hashchange',navigate);
window.addEventListener('scroll',()=>{const sticky=$('#courseSticky'),hero=$('.ref-course-hero');if(sticky&&hero){const navigationHeight=document.querySelector('.header')?.getBoundingClientRect().height||64;sticky.classList.toggle('visible',hero.getBoundingClientRect().bottom<=navigationHeight)}},{passive:true});
document.addEventListener('click',e=>{const anchor=e.target.closest('a[href="#/course#prices"],a[href="#/mentorship#request"]');if(!anchor)return;if(location.hash===anchor.getAttribute('href')){e.preventDefault();document.getElementById(anchor.hash.split('#').pop())?.scrollIntoView({behavior:'smooth'})}});
init();