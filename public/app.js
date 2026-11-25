import {translatePage,translateText} from './i18n.js';
import {MEDIA,mediaFigure} from './media.js';
import {EDITORIAL_DEFAULTS} from './editorial-fallback.js';
import {accessibleLessons,learningProgress,courseLearningProgress} from './account-progress.js';
import {editorialEditor} from './editorial-admin.js';
import {studentCertificatesMarkup,adminCertificatesMarkup,verifyCertificateView} from './certificates.js';
import {renderStudy} from './learning.js?v=20261124-private-learning';
import {beginCheckout,resumeCheckout,renderPaymentStatus,orderSelectionMarkup,paymentHistoryMarkup} from './checkout.js?v=20261124-mentorship-commerce';
const $=s=>document.querySelector(s),app=$('#app');
const readCart=()=>{try{const v=JSON.parse(localStorage.getItem('legwork_cart')||'[]');return Array.isArray(v)?[...new Set(v.filter(Number.isSafeInteger))].slice(0,30):[]}catch{return []}};
const readBundleCart=()=>{try{const ids=JSON.parse(localStorage.getItem('legwork_bundle_cart')||'[]');return Array.isArray(ids)?[...new Set(ids.filter(Number.isSafeInteger))].slice(0,30):[]}catch{return []}};
const state={user:null,courses:[],lessons:[],bundles:[],mentorshipOffers:[],content:null,media:{},dashboard:null,admin:null,cart:readCart(),bundleCart:readBundleCart(),lang:localStorage.getItem('legwork_lang')==='es'?'es':'en',tab:'overview',serviceIssue:false,registrationOpen:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>'$'+(c/100).toFixed(0);
const t=(en,es)=>state.lang==='es'?es:en;
const api=async(url,method='GET',data)=>{const r=await fetch('/api'+url,{method,headers:{...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,credentials:'same-origin'});const d=await r.json();if(!r.ok)throw Error(translateText(d.error||'Request failed',state.lang));return d};
// Re-encode admin images in the browser: no paid Cloudflare Images binding needed.
// Canvas also discards original EXIF/location metadata before upload.
const uploadPublicImage=async file=>{
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP image');
 if(file.size>6*1024*1024||file.size<16)throw Error('Image must be between 16 bytes and 6 MB');
 let bitmap;
 try{bitmap=await createImageBitmap(file)}
 catch{throw Error('The selected image could not be opened')}
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>20000000)throw Error('Image dimensions are unsupported');
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)throw Error('Image conversion is unavailable in this browser');
  let encoded=null;
  for(let i=0;i<7;i++){
   const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height))*Math.pow(.84,Math.max(0,i-2));
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));
   canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   ctx.clearRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const quality=Math.max(.52,.86-i*.065);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
   if(!blob||blob.type!=='image/webp')throw Error('WebP encoding is unavailable in this browser');
   if(blob.size>=16&&blob.size<=2*1024*1024){encoded=blob;break}
  }
  if(!encoded)throw Error('Image is too large after compression (2 MB limit)');
  const response=await fetch('/api/admin/image-upload',{method:'POST',headers:{'Content-Type':'image/webp'},body:encoded,credentials:'same-origin'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Image upload failed');
  return data.url;
 }finally{bitmap?.close?.()}
};
const askConfirmation=message=>window.confirm(translateText(message,state.lang));
const askReason=message=>window.prompt(translateText(message,state.lang));
const notice=m=>{const el=$('#toast');el.textContent=translateText(m,state.lang);el.style.display='block';clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.style.display='none',4200)};
const btn=(label,route,style='btn-red')=>'<a class="btn '+style+'" href="#/'+route+'">'+label+'</a>';
const card=(title,body,tag='')=>'<div class="card"><div class="card-body">'+(tag?'<p class="eyebrow">'+tag+'</p>':'')+'<h3>'+esc(title)+'</h3><p>'+body+'</p></div></div>';
const visual=(label,type='dark')=>'<div class="visual '+type+'"><b>'+esc(label)+'</b></div>';
const faq=(arr)=>'<div class="faq">'+arr.map(([q,a])=>'<details><summary>'+esc(q)+'</summary><p>'+esc(a)+'</p></details>').join('')+'</div>';
const getId=(route)=>Number(route.split('/')[1]);
const mediaInline=(slot,className,fallback='')=>{
 const item=state.media?.[slot];
 return item?.type==='image'&&item.url?'<img class="'+esc(className)+'" src="'+esc(item.url)+'" alt="'+esc(item.alt||'')+'" loading="lazy" decoding="async">':fallback;
};
const mediaPicture=(slot,className,fallback)=>{
 const item=state.media?.[slot];
 if(item?.type!=='image'||!item.url)return fallback;
 const credit=item.credit?'<figcaption class="photo-credit">'+(item.source_url?'<a href="'+esc(item.source_url)+'" target="_blank" rel="noopener noreferrer">'+esc(item.credit)+'</a>':esc(item.credit))+'</figcaption>':'';
 return '<figure class="'+esc(className)+' media-slot">'+mediaInline(slot,'media-photo')+credit+'</figure>';
};

const syncHeader=()=>{$('#accountLink').textContent=state.user?(state.lang==='es'?'Mi cuenta':'My account'):(state.lang==='es'?'Iniciar sesión':'Log in');$('#cartCount').textContent=state.cart.length+state.bundleCart.length;$('#langBtn').textContent=state.lang.toUpperCase()+' / '+(state.lang==='en'?'ES':'EN');document.documentElement.lang=state.lang;const cartLabel=$('#cartBtn')?.firstChild;if(cartLabel)cartLabel.nodeValue=(state.lang==='es'?'Cesta ':'Bag ');$('#cartDrawer')?.setAttribute('aria-label',state.lang==='es'?'Cesta de compra':'Shopping cart');document.querySelectorAll('#nav [data-i18n]').forEach(a=>{const labels={about:['About','Sobre mí'],courses:['Courses','Cursos'],classes:['Classes','Clases'],mentorship:['Mentorship','Mentoría']};a.textContent=labels[a.dataset.i18n]?.[state.lang==='es'?1:0]||a.textContent});const start=document.querySelector('.header-cta');if(start)start.textContent=state.lang==='es'?'Empezar':'Get started';}
const editorial=(page,key)=>{
 const value=state.content?.[page]?.[state.lang]?.[key]??EDITORIAL_DEFAULTS[page]?.[state.lang]?.[key]??'';
 // Old locally seeded editorial values can outlive a redesign.
 // Replace only the original legacy slogans; keep genuine admin edits intact.
 const outdated={
  en:{home:{headlineTop:{'MOVE LIKE':'HI THERE! SVITLANA YURCHAK,'},headlineAccent:{'A BOSS.':'EXOTIC POLE ARTIST & COACH'},intro:{'Learn exotic pole dance with confidence, intention, and movement that feels unmistakably yours.':'Online exotic pole dance lessons from the basics to advanced technique.'}}},
  es:{home:{headlineTop:{'MUÉVETE COMO':'HOLA, SOY SVITLANA YURCHAK,'},headlineAccent:{'UNA JEFA.':'ARTISTA Y PROFESORA DE EXOTIC POLE'}}}
 };
 return esc(outdated[state.lang]?.[page]?.[key]?.[value]??value)
};
const refreshMeta=()=>{const route=(location.hash.startsWith('#/')?location.hash.slice(2):(location.pathname.replace(/^\//,'')||'')).split(/[?#]/)[0];const page=route===''?'home':route==='course'?'course':route==='mentorship'?'mentorship':null;const values=page?(state.content?.[page]?.[state.lang]||EDITORIAL_DEFAULTS[page]?.[state.lang]):null;const shop=route==='shop';document.title=values?.metaTitle||(shop?'Online Dance Classes & Bundles | Legwork':'Legwork · Online Dance School');const description=document.querySelector('meta[name="description"]');if(description)description.setAttribute('content',values?.metaDescription||(shop?'Browse individual pole dance technique classes and lesson bundles.':'Online dance lessons and mentorship at Legwork.'));
 const publicPath=route===''?'/':['course','shop','mentorship'].includes(route)?'/'+route:null;
 const canonical=document.querySelector('link[rel="canonical"]');
 if(canonical&&publicPath)canonical.href=location.origin+publicPath;
 const robots=document.querySelector('meta[name="robots"]');
 if(robots)robots.content=publicPath&&robots.dataset.indexEnabled==='true'?'index,follow':'noindex,nofollow';
};
function layout(markup){document.body.classList.remove('shop-filters-open');const offline=state.serviceIssue?'<div class="site-service-notice" role="status">'+t('Some school services are temporarily unavailable. You can still explore the school; account and purchase features may need attention.','Algunos servicios no están disponibles temporalmente. Puedes explorar la escuela; el acceso y las compras pueden verse afectados.')+'</div>':'';app.innerHTML=offline+markup;syncHeader();translatePage(app,state.lang);translatePage(document.querySelector('footer'),state.lang);refreshMeta()}
function section(title,content,kicker='',cls=''){return '<section class="section '+cls+'"><div class="section-inner">'+(kicker?'<p class="eyebrow">'+kicker+'</p>':'')+(title?'<h2>'+title+'</h2>':'')+content+'</div></section>'}

function home(){
 const heroVideo=state.media?.home_hero_video,heroPoster=state.media?.home_hero_poster;
 const heroMedia=heroVideo?.url
  ?'<video class="home-hero-video" autoplay muted loop playsinline preload="metadata" poster="'+esc(heroPoster?.url||'')+'" aria-hidden="true"><source src="'+esc(heroVideo.url)+'"></video>'
  :mediaPicture('home_hero_poster','home-hero-photo',mediaFigure('stage','home-hero-photo'));

 // Retain the genuine story and teaching philosophy from the original website.
 // Never display fake review cards or unapproved photos.
 const timeline=[
  ['01',t('The beginning','El comienzo'),t('Svitlana began pole dance at 21, without a dance or sports background.','Svitlana comenzó pole dance a los 21 años, sin experiencia previa en danza ni deporte.')],
  ['02',t('A turning point','Un punto de inflexión'),t('Shoulder injuries led her to explore floor waves and new ways to move.','Las lesiones de hombro la llevaron a explorar las ondas en el suelo y nuevas formas de moverse.')],
  ['03',t('Her own technique','Una técnica propia'),t('From that exploration came original elements and the Flexi Legs method.','De esa exploración surgieron elementos originales y el método Flexi Legs.')],
  ['04',t('Beyond the studio','Más allá del estudio'),t('Performances, competitions and workshops shaped her work as a dancer.','Las actuaciones, competiciones y talleres marcaron su trayectoria como bailarina.')],
  ['05',t('Teaching online','Enseñar online'),t('Today she shares her approach through structured lessons and personal guidance.','Hoy comparte su enfoque a través de clases estructuradas y orientación personal.')]
 ];
 const journey=timeline.map(([number,title,description],i)=>{
  const key='home_timeline_'+(i+1);
  const picture='<div class="home-journey-image'+(state.media?.[key]?.url?'':' is-unassigned')+'">'+mediaInline(key,'home-journey-img')+'</div>';
  return '<li class="home-journey-item">'+picture+'<span class="home-journey-num">'+number+'</span><div><h3>'+title+'</h3><p>'+description+'</p></div></li>';
 }).join('');
 const principles=[
  [t('Know the path from zero','Conozco el camino desde cero'),t('Svitlana started pole dance at 21 with no dance or sports background.','Svitlana empezó pole dance a los 21 años sin experiencia en danza ni deporte.')],
  [t('A method born from limitations','Un método nacido de las limitaciones'),t('Her method grew from working around physical limitations rather than forcing flexibility.','Su método nació de adaptarse a las dificultades físicas sin forzar la flexibilidad.')],
  [t('More than 5,000 students','Más de 5.000 alumnas'),t('Students at different levels have trained with her method.','Alumnas de diferentes niveles han entrenado con su método.')],
  [t('Always improving','Siempre mejorando'),t('The courses evolve with teaching experience and real student feedback.','Los cursos evolucionan con la experiencia docente y los comentarios reales de las alumnas.')]
 ];
 const benefits=principles.map(([title,description],i)=>
  '<article class="home-method-item"><span>0'+(i+1)+'</span><h3>'+title+'</h3><p>'+description+'</p></article>'
 ).join('');

 const galleryKeys=['home_workshop_1','home_workshop_2','home_workshop_3','home_workshop_4','home_workshop_5'].filter(key=>state.media?.[key]?.url);
 const gallery=galleryKeys.length
  ?'<section class="section home-section home-gallery"><div class="section-inner"><p class="home-section-note">'+t('MOMENTS FROM THE STUDIO','MOMENTOS DEL ESTUDIO')+'</p><h2>'+t('In motion.','En movimiento.')+'</h2><div class="home-gallery-grid">'+galleryKeys.map(key=>'<div class="gallery-frame">'+mediaInline(key,'home-gallery-media')+'</div>').join('')+'</div></div></section>'
  :'';
 const reviewKeys=['home_review_1','home_review_2','home_review_3','home_review_4','home_review_5','home_review_6'].filter(key=>state.media?.[key]?.url);
 const reviews=reviewKeys.length
  ?'<section class="section home-section home-reviews-published"><div class="section-inner"><p class="home-section-note">'+t('FROM OUR STUDENTS','DE NUESTRAS ALUMNAS')+'</p><h2>'+t('Their words.','Sus palabras.')+'</h2><div class="home-approved-reviews">'+reviewKeys.map(key=>'<div class="home-review-frame">'+mediaInline(key,'home-review-img')+'</div>').join('')+'</div></div></section>'
  :'';
 const freeLesson=state.lessons.find(l=>l.free);
 const freeInvite='<section class="home-free-invite"><div class="ref-wrap"><div><p class="eyebrow">'+t('01 / YOUR FIRST CLASS','01 / TU PRIMERA CLASE')+'</p><h2>'+t('GET YOUR FREE LESSON','RECIBE TU CLASE GRATIS')+'</h2><p class="home-free-description">'+t('Try the introduction before choosing a full course. A free account is needed to watch.','Prueba la clase introductoria antes de elegir un curso. Necesitas una cuenta gratuita para verla.')+'</p></div><div class="home-free-actions">'+(freeLesson?'<a class="btn btn-dark" href="#/lesson/'+freeLesson.id+'">'+t('Try free lesson','Probar clase gratis')+' →</a>':'<a class="btn btn-dark" href="#/course">'+t('Explore the course','Explorar el curso')+' →</a>')+'</div></div></section>';

 layout(
  '<section class="ref-hero home-hero"><div class="ref-wrap"><div class="hero-copy"><p class="hero-kicker">'+editorial('home','eyebrow')+'</p><h1 data-no-i18n>'+editorial('home','headlineTop')+' '+editorial('home','headlineAccent')+'</h1><p data-no-i18n>'+editorial('home','intro')+'</p><div class="hero-actions"><a class="btn btn-red" href="#/course" data-no-i18n>'+editorial('home','cta')+'</a><a class="btn btn-outline" href="#/shop">'+t('Explore classes','Explorar clases')+'</a></div></div><div class="home-hero-media">'+heroMedia+'<span class="hero-side-note">'+t('THE ART OF MOVEMENT','EL ARTE DEL MOVIMIENTO')+'</span></div></div></section>'+
  '<section class="section home-section home-story"><div class="section-inner"><div class="home-story-head"><div><p class="home-section-note">'+t('THE STORY','LA HISTORIA')+'</p><h2>'+t('A practice shaped by experience.','Una práctica marcada por la experiencia.')+'</h2></div><p class="home-intro-lead">'+t('Every technique has a story. This one started long before an online school.','Cada técnica tiene una historia. Esta comenzó mucho antes de la escuela online.')+'</p></div><ol class="home-journey">'+journey+'</ol></div></section>'+
  '<section class="section home-section home-method"><div class="section-inner"><div class="home-method-head"><p class="home-section-note">'+t('THE APPROACH','EL ENFOQUE')+'</p><h2>'+t('More than memorising moves.','Más que memorizar movimientos.')+'</h2></div><div class="home-method-grid">'+benefits+'</div></div></section>'+
  '<section class="section home-section home-courses"><div class="section-inner"><div class="home-courses-head"><div><p class="home-section-note">'+t('OUR COURSES','NUESTROS CURSOS')+'</p><h2>'+t('Find your next move.','Encuentra tu próximo movimiento.')+'</h2></div></div><div class="home-program-grid"><a class="home-program-primary" href="#/course"><span class="program-top">'+t('THE SIGNATURE COURSE','EL CURSO PRINCIPAL')+'</span><strong class="program-name"><span class="course-color-legwork">LEGWORK</span> <span>LIKE A</span> <em>BOSS</em></strong><span class="program-bottom"><small>'+t('Legwork technique, transitions and control — one move at a time.','Técnica, transiciones y control de piernas, paso a paso.')+'</small><span class="program-cta">'+t('To course page','Ver curso')+' →</span></span></a><div class="home-program-links"><article class="home-program-link is-coming-soon"><span class="program-top">'+t('NEXT IN THE SCHOOL','PRÓXIMAMENTE')+'</span><h3><span class="course-color-wave">WAVE</span> LIKE A <em>BOSS</em></h3><span class="program-soon">'+t('Coming soon','Próximamente')+'</span></article><article class="home-program-link is-coming-soon"><span class="program-top">'+t('NEXT IN THE SCHOOL','PRÓXIMAMENTE')+'</span><h3><span class="course-color-split">SPLIT</span> LIKE A <em>BOSS</em></h3><span class="program-soon">'+t('Coming soon','Próximamente')+'</span></article></div></div></div></section>'+
  '<section class="section home-section home-recognition"><div class="section-inner"><div class="home-proof-grid"><div><p class="home-section-note">'+t('ON STAGE AND IN THE STUDIO','EN EL ESCENARIO Y EL ESTUDIO')+'</p><h2>'+t('Experience behind the movement.','Experiencia detrás de cada movimiento.')+'</h2><p class="proof-intro">'+t('Dance, performance and teaching all inform the method.','La danza, la interpretación y la enseñanza forman parte del método.')+'</p></div><div><div class="home-proof-list"><p>Exotic Dancer of the Year · 2016</p><p>TOP-15 · UPA</p><p>Ukraine’s Got Talent · semifinalist</p><p>'+t('Creator of the YURCHAK apparel brand','Creadora de la marca de ropa YURCHAK')+'</p></div><div class="home-experience-tabs"><div class="home-tabs" role="tablist" aria-label="'+t('Experience','Experiencia')+'"><button type="button" id="home-tab-championships" class="active" data-showtab="championships" role="tab" aria-controls="showsPanel" aria-selected="true">'+t('Competitions','Competiciones')+'</button><button type="button" id="home-tab-shows" data-showtab="shows" role="tab" aria-controls="showsPanel" aria-selected="false">'+t('Shows','Espectáculos')+'</button><button type="button" id="home-tab-judging" data-showtab="judging" role="tab" aria-controls="showsPanel" aria-selected="false">'+t('Teaching & judging','Enseñar y evaluar')+'</button></div><div class="home-tab-panel" id="showsPanel" role="tabpanel" aria-labelledby="home-tab-championships"><h3>'+t('Competitions','Competiciones')+'</h3><p>'+t('Experience on the competitive and international pole dance stage.','Experiencia en competiciones y escenarios internacionales de pole dance.')+'</p></div></div></div></div></div></section>'+
  gallery+reviews+freeInvite+
   section('Your questions, answered',faq([
    ['Do I need dance experience to start?','No. Legwork Lab includes introductory technique, and each individual class lists its level.'],
    ['Can I try a class before buying?','Yes. An introductory class is free after creating a school account.'],
    ['Do I need a pole for every lesson?','No. Individual classes list their equipment and some work with other stable support.'],
    ['Can I buy just one lesson?','Yes. Choose individual classes or active bundles from the Classes library.'],
    ['How does personal feedback work?','The Guru course plan includes homework and teacher feedback; Mentorship offers an individual video review.'],
    ['Will I receive a certificate?','With Guru, certificates require completion of the specified homework and teacher approval.']
   ]),'GOOD TO KNOW','home-faq')+
   '<section class="home-final-cta"><div class="ref-wrap"><div><p class="eyebrow">A NEW WAY TO MOVE</p><h2>READY TO BEGIN?</h2></div><a class="btn btn-red" href="#/course">Explore Legwork Lab →</a></div></section>'
 );
}
function course(){
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
 const courseReviewKeys=Array.from({length:6},(_,i)=>'course_review_'+(i+1)).filter(key=>state.media?.[key]?.url);
 const courseReviews=courseReviewKeys.length?'<section class="section course-approved-reviews"><div class="section-inner"><p class="eyebrow">REAL STUDENT EXPERIENCES</p><h2>In their own words.</h2><div class="course-review-track">'+courseReviewKeys.map(key=>'<figure class="course-review-frame">'+mediaInline(key,'course-review-image')+'</figure>').join('')+'</div></div></section>':'';

 const tiles=courseLessons.map((l,i)=>'<a class="course-program-card" href="#/lesson/'+l.id+'"><span class="course-program-visual">'+(l.cover_url?'<img src="'+esc(l.cover_url)+'" loading="lazy" decoding="async" alt="">':'<span class="course-program-empty" aria-hidden="true"></span>')+'<span class="course-lesson-number">'+String(i+1).padStart(2,'0')+'</span></span><span class="course-program-info"><strong>'+esc(l.title)+'</strong><small>'+esc(l.equipment||'Any support')+' · '+Number(l.duration||12)+' min'+(l.free?' · FREE':'')+'</small></span></a>').join('');
 const faqItems=[
  ['Do I need to be flexible?','No. Start at a comfortable range of motion. The course focuses on technique and control.'],
  ['Do I need a pole?','Some lessons use a pole or stable support. Equipment is listed with each class.'],
  ['How do I access the lessons?','After purchase confirmation, the lessons appear in My Courses in your account.'],
  ['Can I send homework?','The Guru format includes homework submission and teacher feedback.'],
  ['What is the refund policy?','Review the refund terms before payment or contact the school about your order.']
 ];
 layout(
  '<div class="ref-course-bar" id="courseSticky"><div class="ref-wrap"><span class="course-sticky-title">LEGWORK LIKE A BOSS</span><span>from '+price+'</span><a class="btn btn-red" href="#/course#prices">Join the course</a></div></div>'+
  '<section class="ref-course-hero"><div class="ref-wrap"><p class="course-kicker" data-no-i18n>'+editorial('course','eyebrow')+'</p><h1 data-no-i18n>'+editorial('course','headline')+'</h1><p class="course-identity"><strong>LEGWORK</strong> LIKE A <em>BOSS</em></p><div class="course-hero-layout"><div class="course-hero-copy"><p data-no-i18n>'+editorial('course','intro')+'</p><div class="course-hero-actions"><a href="#/course#prices" class="btn btn-red" data-no-i18n>'+editorial('course','cta')+'</a>'+(freeLesson?'<a class="btn btn-outline" href="#/lesson/'+freeLesson.id+'">Try a free lesson</a>':'')+'</div></div>' +mediaPicture('course_hero','course-photo',mediaFigure('stage','course-photo'))+'</div></div></section>'+
  section('Who is this for?','<div class="course-fit-list">'+audience.map(([title,desc],i)=>'<div class="course-fit-item"><span>'+String(i+1).padStart(2,'0')+'</span><div><h3>'+title+'</h3><p>'+desc+'</p></div></div>').join('')+'</div>','EVERY STAGE HAS A STARTING POINT')+
  section('What will change?','<div class="course-results">'+outcomes.map(([title,desc])=>'<div class="course-result"><span aria-hidden="true">↗</span><div><h3>'+title+'</h3><p>'+desc+'</p></div></div>').join('')+'</div>','MORE THAN JUST MORE MOVES','muted-section')+
  '<section class="course-author"><div class="ref-wrap"><div><span class="eyebrow">YOUR COACH</span><strong>Svitlana Yurchak</strong><p>Exotic pole artist and creator of the Flexi Legs technique.</p></div><a class="course-text-link" href="#/">More about Svitlana →</a></div></section>'+
  section('How it works','<div class="course-steps">'+steps.map(([n,title,desc])=>'<div><span>'+n+'</span><h3>'+title+'</h3><p>'+desc+'</p></div>').join('')+'</div>','A CLEAR PATH, AT YOUR PACE')+
  section('Inside the course','<div class="course-preview-head"><p>Prestart foundations and technique lessons · '+courseLessons.length+' classes · equipment and duration per lesson.</p><div class="course-preview-views" role="group" aria-label="Program preview layout"><button type="button" data-program-mode="grid" aria-pressed="true">Grid / hover</button><button type="button" data-program-mode="carousel" aria-pressed="false">Carousel</button></div></div><div class="course-equipment-legend">◯ Pole · ◇ Floor · △ Stable support — see each lesson for exact equipment</div><div class="course-lesson-grid" id="courseProgramGrid">'+(tiles||'<p class="course-empty">Lessons will appear here when added to the library.</p>')+'</div><p class="course-program-note">Class previews are shown only when approved media has been published. Paid YouTube sources remain inside the protected classroom.</p>','THE PROGRAM','muted-section')+
  (freeLesson?'<section class="course-free-section"><div class="ref-wrap">'+mediaPicture('course_preview','course-preview-screen','<div class="course-preview-screen"><span aria-hidden="true">▶</span><small>FREE CLASS PREVIEW</small></div>')+'<div><p class="eyebrow">TRY BEFORE YOU JOIN</p><h2>Your first lesson is on us.</h2><p>'+esc(freeLesson.title)+' · '+Number(freeLesson.duration||12)+' minutes. Explore the teaching style before you choose a package.</p><a class="btn btn-red" href="#/lesson/'+freeLesson.id+'">Open free lesson</a></div></div></section>':'')+
  courseReviews+
  '<section class="section course-pricing-section" id="prices"><div class="section-inner"><p class="eyebrow">YOUR TRAINING, YOUR WAY</p><h2>Choose your format</h2><p class="course-pricing-intro">One program, with or without personal feedback.</p><div class="ref-prices"><div class="price-card"><h3>Independent</h3><p class="price">'+price+'</p><ul class="course-includes"><li>Full course library</li><li>Learn at your own pace</li><li>Track your progress</li></ul><button class="btn btn-dark" data-order="course" data-id="'+(c?.id||1)+'">Choose Independent</button></div><div class="price-card featured"><span class="course-featured-label">WITH PERSONAL FEEDBACK</span><h3>Guru</h3><p class="price">'+guruPrice+'</p><ul class="course-includes"><li>Everything in Independent</li><li>Submit homework</li><li>Get teacher feedback</li><li>Certificate pathway after completion</li></ul><button class="btn btn-red" data-order="course" data-plan="guru" data-id="'+(c?.id||1)+'">Choose Guru</button></div></div><p class="course-pricing-note">Final access and payment conditions are shown before checkout.</p></div></section>'+
  section('Work toward your certificate','<div class="course-completion"><div><p class="eyebrow">AFTER THE LAST CLASS</p><h3>Learn. Practise. Complete.</h3><p>With Guru, you can submit homework and receive a teacher review. A course certificate is issued after completing the required assignments and approval.</p></div><a class="btn btn-outline" href="#/account">My learning space →</a></div>','KEEP YOUR MOMENTUM','muted-section')+
  (state.bundles.length?section('Your next move','<div class="grid grid-3">'+state.bundles.slice(0,3).map(bundleCard).join('')+'</div>','MORE TO PRACTISE'):'')+
  section('Frequently asked questions',faq(faqItems),'','course-faq')
 );
}function lessonCard(l,studyMode=false){
 const destination=studyMode===true?'study':'lesson';
 const cover=l.cover_url?'<img class="lesson-cover-image" loading="lazy" decoding="async" src="'+esc(l.cover_url)+'" alt="'+esc(l.title)+' lesson cover">':'';
 const done=studyMode&&!!state.dashboard?.progress?.some(row=>Number(row.lesson_id)===Number(l.id)&&(row.completed===1||row.completed===true));
 const accessLabel=studyMode?'<span class="lesson-library-status">'+(done?'COMPLETED':'IN YOUR LIBRARY')+'</span>':(l.free?'FREE':money(l.price));
 const action=studyMode
  ?'<a class="btn btn-small btn-outline" href="#/study/'+l.id+'">'+(done?'Revisit':'Study')+'</a>'
  :l.free
   ?'<a class="btn btn-small btn-outline" href="#/lesson/'+l.id+'">View lesson</a>'
   :'<button class="btn btn-small btn-dark" type="button" data-cart="'+l.id+'">Add to bag</button>';
 return '<article class="card lesson-card'+(done?' is-complete':'')+'"><a class="lesson-cover '+(cover?'has-image':'')+'" href="#/'+destination+'/'+l.id+'" aria-label="View '+esc(l.title)+'">'+cover+'<span class="lesson-cover-top">'+esc(l.category||'LEGWORK')+'</span><span class="lesson-cover-index">'+(l.free?'FREE CLASS':'LESSON '+String(l.sort_order||l.id).padStart(2,'0'))+'</span></a><div class="card-body"><h3><a href="#/'+destination+'/'+l.id+'">'+esc(l.title)+'</a></h3><p class="meta">'+esc(l.level)+' · '+Number(l.duration||0)+' min · '+esc(l.equipment||'Any support')+'</p><div class="row"><b>'+accessLabel+'</b>'+action+'</div></div></article>';
}
function bundleCard(bundle){
 return '<article class="card bundle-card"><a href="#/bundle/'+bundle.id+'" class="bundle-cover" aria-label="View '+esc(bundle.title)+'">'+mediaInline('shop_bundle','bundle-cover-image','<span class="bundle-cover-stack" aria-hidden="true"><i></i><i></i><i></i></span>')+'</a><div class="card-body"><h3><a href="#/bundle/'+bundle.id+'">'+esc(bundle.title)+'</a></h3><p class="bundle-lessons">'+bundle.lesson_ids.length+' lessons · '+esc(bundle.direction)+'</p><div class="row"><span><s class="meta">'+money(bundle.original_price)+'</s> <b class="price">'+money(bundle.price)+'</b></span><button type="button" class="btn btn-dark btn-small" data-cart-bundle="'+bundle.id+'">Add to bag</button></div></div></article>';
}
function bundlePage(route){
 const id=Number(route.split('/')[1]),b=state.bundles.find(x=>x.id===id);
 if(!b)return layout(section('Bundle unavailable','<p>This bundle is no longer available.</p>'+btn('BACK TO CLASSES','shop')));
 const lessons=b.lesson_ids.map(id=>state.lessons.find(l=>l.id===id)).filter(Boolean);
 layout(section(esc(b.title),'<p class="eyebrow"><a href="#/shop">CLASSES</a> / '+esc(b.direction)+' / BUNDLE</p><div class="grid grid-2"><div>'+bundleCard(b)+'</div><div><p class="description">'+esc(b.description)+'</p><p class="eyebrow">'+lessons.length+' INCLUDED LESSONS</p><div class="stack">'+lessons.map(l=>'<a class="item-row row" href="#/lesson/'+l.id+'"><span>'+esc(l.title)+'</span><span>'+esc(l.level)+' · '+l.duration+' min</span></a>').join('')+'</div><p class="description">One request grants access to every lesson in this bundle after independent payment confirmation.</p><button type="button" class="btn btn-red" data-cart-bundle="'+b.id+'">ADD COMPLETE BUNDLE TO BAG</button></div></div>','BUILD YOUR PRACTICE'));
}
let shopSearchTimer=null;
function applyShopSearch(value,restoreFocus=false,caret=null){
 if(!location.hash.startsWith('#/shop'))return;
 const params=new URLSearchParams(location.hash.split('?')[1]||'');
 const term=String(value||'').trim().slice(0,120);
 if(term)params.set('q',term);else params.delete('q');
 const next='#/shop'+(params.toString()?'?'+params.toString():'');
 if(next===location.hash)return;
 const scroll=window.scrollY;
 // One replaceState per search avoids browser-history entries for every key.
 history.replaceState(null,'',next);
 shop();
 if(restoreFocus){
  const input=$('#shopSearch');
  input?.focus({preventScroll:true});
  if(input&&Number.isInteger(caret)){try{input.setSelectionRange(Math.min(caret,input.value.length),Math.min(caret,input.value.length))}catch{}}
 }
 window.scrollTo(0,scroll);
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
 const selectGroup=(heading,id,values,selected)=>'<fieldset class="shop-filter-group"><legend>'+heading+'</legend><select class="shop-filter-select" id="'+id+'" size="'+(values.length+1)+'" aria-label="'+heading+'"><option value="" '+(!selected?'selected':'')+'>All</option>'+values.map(v=>'<option value="'+esc(v)+'" '+(selected===v?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></fieldset>';
 const sidebar=
  '<aside class="shop-sidebar" id="shopFilterPanel" aria-label="Filter classes"><div class="shop-filter-panel-head"><strong>Filters</strong><button id="shopFiltersClose" type="button" aria-label="Close filters">✕</button></div>'+
  selectGroup('Direction','filterCategory',categories,query.category)+
  filterGroup('Lesson type','kind',['Element','Preparation','Warm-up','Bundle'])+
  filterGroup('Equipment','equipment',equipment)+
  selectGroup('Level','filterLevel',['Beginner','Intermediate','Advanced'],query.level)+
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
 const activeChips=(query.search?'<button type="button" class="shop-active-chip" data-shop-search-clear="1" aria-label="Remove search term '+esc(query.search)+'">Search: '+esc(query.search)+' <span aria-hidden="true">×</span></button>':'')+Object.entries(filterNames).filter(([key])=>query[key]).map(([key,label])=>'<button type="button" class="shop-active-chip" data-shop-filter="'+key+'" data-shop-value="'+esc(query[key])+'">'+label+': '+esc(query[key])+' <span aria-hidden="true">×</span></button>').join('');
 const results=lessons.map(l=>lessonCard(l)).join('')+bundles.map(bundleCard).join('');
 layout(
  '<section class="shop-heading"><div class="section-inner"><h1>CLASSES</h1><p>Learn only what you need right now.</p></div></section>'+

  '<section class="shop-main"><div class="shop-layout"><div class="shop-filter-shade" id="shopFilterShade" hidden></div>'+sidebar+
  '<div class="shop-catalog"><div class="shop-search-row"><label class="sr-only" for="shopSearch">Search classes by name or hashtag</label><input class="field" id="shopSearch" type="search" placeholder="Search a lesson or #hashtag (#kneecircle, #legwave)" value="'+esc(query.search)+'"><button type="button" id="shopSearchApply" aria-label="Search classes">Search</button><button type="button" id="shopFiltersToggle" aria-controls="shopFilterPanel" aria-expanded="false">Filters <span aria-hidden="true">☷</span></button></div>'+
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
function lesson(route){
 const l=state.lessons.find(item=>item.id===getId(route));
 if(!l)return layout(section('Lesson not found','<p>This class is no longer available.</p>'+btn('Back to classes','shop')));
 const suggested=state.lessons.filter(item=>item.id!==l.id&&item.category===l.category).slice(0,3);
 const preparations=state.lessons.filter(item=>item.id!==l.id&&item.kind==='Preparation'&&item.category===l.category).slice(0,3);
 const bundle=state.bundles.find(item=>item.lesson_ids.includes(l.id));
 const cover=l.cover_url?'<img class="lesson-detail-art" src="'+esc(l.cover_url)+'" alt="" loading="eager" decoding="async">':'<div class="lesson-detail-art is-unassigned" aria-hidden="true"></div>';
 layout(
  '<section class="section lesson-detail"><div class="section-inner"><nav class="lesson-breadcrumbs" aria-label="Breadcrumb"><a href="#/shop">Classes</a> / <a href="#/shop?category='+encodeURIComponent(l.category)+'">'+esc(l.category)+'</a> / '+esc(l.title)+'</nav><div class="lesson-detail-layout"><div class="lesson-detail-media">'+cover+'<p class="description">The paid training video is available only inside your account after access has been granted.</p><div id="playerMount"></div></div><aside class="lesson-detail-purchase"><p class="eyebrow">SVITLANA YURCHAK / CLASS LIBRARY</p><h1>'+esc(l.title)+'</h1><p class="lesson-detail-meta">'+esc(l.level||'All levels')+' · '+Number(l.duration||0)+' min · '+esc(l.category)+' · '+esc(l.equipment||'Check lesson equipment')+'</p><p class="price">'+(l.free?'FREE':money(l.price))+'</p><p>Explore this technique as an individual lesson or as part of a structured course.</p><button type="button" class="btn btn-dark" data-watch="'+l.id+'">Watch with my access ▶</button>'+(l.free?'':'<button type="button" class="btn btn-red" data-cart="'+l.id+'">Add lesson to bag</button>')+'<p class="description">Payment and access are confirmed by the school. The button above does not bypass purchase verification.</p></aside></div></div></section>'+
  section('What is included','<div class="lesson-details-list"><div><strong>TECHNIQUE</strong><span>'+esc(l.title)+'</span></div><div><strong>LEVEL</strong><span>'+esc(l.level||'All levels')+'</span></div><div><strong>TRAINING TIME</strong><span>'+Number(l.duration||0)+' minutes</span></div><div><strong>EQUIPMENT</strong><span>'+esc(l.equipment||'See the lesson for equipment')+'</span></div></div>','YOUR CLASS','muted-section')+
  (preparations.length?section('Prepare for this element','<p class="description">Preparation exercises from the same direction.</p><div class="grid grid-3">'+preparations.map(lessonCard).join('')+'</div>'+(bundle?'<div class="lesson-bundle-cta"><span>Practise this with its related lessons</span><a class="btn btn-red" href="#/bundle/'+bundle.id+'">See bundle · '+money(bundle.price)+'</a></div>':''),'BUILD UP TO THE MOVE'):'')+
  section('Part of a bigger practice','<div class="lesson-related-course"><div><p class="eyebrow">LEGWORK LAB</p><h3>LEGWORK <em>LIKE A BOSS</em></h3><p>A full program puts individual elements into sequence with a clear learning path.</p></div><a class="btn btn-outline" href="#/course">Explore Legwork Lab →</a></div>','THE SIGNATURE PROGRAM','muted-section')+
  (suggested.length?section('More moves to explore','<div class="grid grid-3">'+suggested.map(lessonCard).join('')+'</div>','RELATED CLASSES'):'')
 );
}
function mentorship(){
 const reviewKeys=Array.from({length:4},(_,i)=>'mentorship_review_'+(i+1)).filter(key=>state.media?.[key]?.url);
 const offerText=pack=>{
  const offer=state.mentorshipOffers.find(o=>o.package===pack&&o.published);
  return offer?'$'+(offer.price_usd_cents/100).toFixed(2)+' USD · Feedback in '+offer.turnaround_business_days+' business days after payment confirmation':'Price and response time confirmed before payment';
 };
 const mentorReviews=reviewKeys.length?'<section class="section mentor-published-reviews"><div class="section-inner"><p class="eyebrow">REAL CLIENT REVIEWS</p><h2>After the feedback.</h2><div class="mentor-review-track">'+reviewKeys.map(key=>'<figure class="mentor-review-frame">'+mediaInline(key,'mentor-review-image')+'</figure>').join('')+'</div></div></section>':'';
 layout(
 '<section class="ref-mentor-hero"><div class="ref-wrap"><p class="eyebrow" data-no-i18n>'+editorial('mentorship','eyebrow')+'</p><h1 data-no-i18n>'+editorial('mentorship','headline')+'</h1><p data-no-i18n>'+editorial('mentorship','intro')+'</p><a class="btn btn-red" href="#/mentorship#request" data-no-i18n>'+editorial('mentorship','cta')+'</a></div></section>'+
 section('Meet your mentor','<div class="ref-mentor-intro">'+mediaPicture('mentorship_portrait','mentor-photo',mediaFigure('portrait','mentor-photo'))+'<div><p class="eyebrow">THE ARTIST & COACH</p><h3>Svitlana Yurchak</h3><p>Exotic pole artist, coach and creator of the Flexi Legs technique. Your video is reviewed personally, with specific direction on what to practise next.</p><ul class="mentor-facts"><li>International performer and championship experience</li><li>Instructor at PoleCon</li><li>Judge and federation member</li></ul></div></div>')+
 section('Choose a review','<div class="ref-prices"><div class="price-card"><span class="mentor-package-tag">QUICK FEEDBACK</span><h3>Basic</h3><p>A focused video review with clear technique notes and practical next steps.</p><ul class="course-includes"><li>One video link</li><li>Personal written feedback</li></ul><p class="mentor-price-status">'+esc(offerText('Basic'))+'</p><a class="btn btn-dark" href="#/mentorship#request" data-package="Basic">Choose Basic</a></div><div class="price-card featured"><span class="mentor-package-tag">MORE DETAIL</span><h3>Deep</h3><p>A detailed breakdown adapted to your experience, training frequency and goals.</p><ul class="course-includes"><li>One video link and expanded questionnaire</li><li>Personal detailed analysis</li><li>Priorities for your next practices</li></ul><p class="mentor-price-status">'+esc(offerText('Deep'))+'</p><a class="btn btn-red" href="#/mentorship#request" data-package="Deep">Choose Deep</a></div></div>','','muted-section')+
 section('How it works','<div class="mentor-steps"><div><span>01</span><strong>Choose a package</strong></div><div><span>02</span><strong>Share your video</strong></div><div><span>03</span><strong>Confirm payment</strong></div><div><span>04</span><strong>Read feedback in your account</strong></div></div>','FOUR SIMPLE STEPS')+
 '<section class="section" id="request"><div class="section-inner"><p class="eyebrow">YOUR PERSONAL FEEDBACK</p><h2>Request a video review</h2><p class="mentorship-form-intro">Choose Basic or Deep, share a video link, and tell Svitlana what to focus on.</p><div class="mentor-request-stages" aria-label="Four stages of your request"><span>1 Package</span><span>2 Video</span><span>3 About you</span><span>4 Payment</span></div><div class="auth-panel ref-mentor-form"><form class="form" id="mentorshipForm"><p class="mentor-step-title">01 / CHOOSE YOUR PACKAGE</p><div class="mentor-plan-toggle" role="group" aria-label="Mentorship package"><button type="button" data-package="Basic" aria-pressed="true">Basic</button><button type="button" data-package="Deep" aria-pressed="false">Deep</button></div><label class="mentor-plan-select">Package<select name="package" id="mentorshipPackage"><option>Basic</option><option>Deep</option></select></label><p class="mentor-step-title">02 / YOUR VIDEO</p><label>Video link<input class="field" required name="video_url" type="url" placeholder="Instagram, YouTube, Dropbox or another HTTPS video link" autocomplete="url"></label><p class="mentor-upload-note">Direct file upload is not available yet. Use a video link that your mentor can access. Your link is stored in the private request; the privacy settings of the video platform still apply.</p><p class="mentor-step-title">03 / ABOUT YOU</p><div class="mentor-input-group"><label>Name<input class="field" value="'+esc(state.user?.name||'Sign in to submit')+'" disabled></label><label>Email<input class="field" value="'+esc(state.user?.email||'Sign in to submit')+'" disabled></label></div><label>Instagram handle (optional)<input class="field" name="instagram" value="'+esc(state.user?.instagram||'')+'" placeholder="@username"></label><label>What would you like help with?<textarea rows="3" name="goals" placeholder="For example: leg lines, transitions or a competition performance"></textarea></label><div class="stack hidden" id="deepFields"><label>Your dance experience<textarea rows="3" name="experience" placeholder="How long have you been dancing?"></textarea></label><label>Training frequency<select name="training_frequency"><option value="">Select</option><option>Once a week</option><option>2–3 times a week</option><option>4+ times a week</option></select></label><label>Do you teach?<select name="teaching"><option value="">Select</option><option>No</option><option>Yes</option></select></label></div><p class="mentor-step-title">04 / CONFIRM YOUR REQUEST</p><p class="notice">This step submits your request; it does not charge you. You can review the request in your account. Published prices and deadlines are fixed when you submit; otherwise the school must confirm them before payment. No card is charged here.</p><button class="btn btn-red" type="submit">Send review request</button></form></div></div></section>'+
 section('Your review, explained','<div class="mentor-example">'+mediaPicture('mentorship_example','mentor-example-screen','<div class="mentor-example-screen" aria-hidden="true"><span>TECHNIQUE<br>NOTES.</span></div>')+'<div><p class="eyebrow">A USEFUL NEXT STEP</p><h3>Not a score. A direction.</h3><p>Your mentor can help you understand what to adjust, which technique to practise and where to focus next. Your actual response appears privately in your account.</p></div></div>','','muted-section')+
 mentorReviews+
 section('Questions',faq([['Which video links work?','Use an HTTPS link from a video platform that lets Svitlana view the video. Check its sharing permissions first.'],['Can I upload a file directly?','Not yet. Secure video-file storage is being prepared; for now, submit a private or unlisted link.'],['When will I receive feedback?','Your response time and exact price are confirmed before payment.'],['Who can see my video?','Authorized school staff can view the submitted link. The hosting platform has its own sharing settings.'],['Where will I receive the review?','The written review appears in your personal account after Svitlana responds. An email notification is sent when mail delivery is configured.']]),'','muted-section')
 );
 const chosen=sessionStorage.getItem('legwork_package')||'Basic';
 const sel=$('#mentorshipPackage');
 if(sel){sel.value=chosen;$('#deepFields')?.classList.toggle('hidden',chosen!=='Deep');document.querySelectorAll('.mentor-plan-toggle [data-package]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.package===chosen)))}
}
function authPage(register=false){
 // Real production registrations require verified email delivery; local tests
 // remain supported over HTTP, and existing students can still sign in.
 if(register&&location.protocol==='https:'&&!state.registrationOpen){
  const heading=t('REGISTRATION IS NOT OPEN YET','EL REGISTRO AÚN NO ESTÁ ABIERTO');
  const details=t('We are preparing secure email confirmation for new students. You can explore the courses now; registration will open once email delivery is ready.','Estamos preparando la confirmación de correo para nuevos estudiantes. Puedes explorar los cursos mientras tanto.');
  layout(section(heading,'<div class="auth-panel"><p class="description">'+details+'</p><div class="auth-wait-actions"><a class="btn btn-dark" href="#/shop">'+t('EXPLORE CLASSES','VER CLASES')+'</a><a class="btn btn-outline" href="#/login">'+t('EXISTING STUDENT? LOG IN','¿YA TIENES CUENTA? ENTRA')+'</a></div></div>',t('YOUR PERSONAL LEARNING SPACE','TU ESPACIO DE APRENDIZAJE'),'muted-section'));
  return;
 }
 layout(section(register?'CREATE AN ACCOUNT':'WELCOME BACK','<div class="auth-panel"><form class="form" id="authForm"><input type="hidden" name="mode" value="'+(register?'register':'login')+'">'+(register?'<label>Full name<input class="field" required name="name" autocomplete="name"></label>':'')+'<label>'+ (register?'Email':'Email or Admin')+'<input class="field" required name="email" '+(register?'type="email"':'type="text"')+' autocomplete="username"></label><label>Password<input class="field" required type="password" name="password" minlength="'+(register?12:1)+'" autocomplete="'+(register?'new-password':'current-password')+'"></label>'+(register?'':'<label>Admin authenticator or backup code (if enabled)<input class="field" name="otp" maxlength="30" autocomplete="one-time-code" placeholder="6-digit code or backup code"></label>')+'<button class="btn btn-red" type="submit">'+(register?'SIGN UP':'LOG IN')+'</button><p class="description">'+(register?'Already have an account? <a href="#/login">Log in</a>':'New to the school? <a href="#/register">Create an account</a> · <a href="#/forgot-password">Forgot password?</a>')+'</p></form></div>','YOUR PERSONAL LEARNING SPACE','muted-section'))}
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

function unsubscribePage(token){
 if(!/^[a-f0-9]{64}$/.test(token))return layout(section('INVALID UNSUBSCRIBE LINK','<p>This email preference link is invalid.</p>'+btn('Back to school',''),'EMAIL PREFERENCES','muted-section'));
 layout(section('EMAIL PREFERENCES','<div class="auth-panel"><p>Unsubscribe from the mailing list connected to this link. This does not delete your course account or purchases.</p><form class="form" id="unsubscribeForm"><input type="hidden" name="token" value="'+esc(token)+'"><button type="submit" class="btn btn-red">Unsubscribe</button></form></div>','YOUR CHOICE','muted-section'));
}
async function account(){if(!state.user)return authPage(false);const expectedHash=location.hash;const [d,achievement,homeworkReviews,paymentConfig,paymentHistory,emailStatus,certificateData,deletionStatus]=await Promise.all([api('/dashboard'),api('/account/achievements'),api('/account/homework-reviews'),api('/payments/config'),api('/payments/mine'),api('/account/email-status'),api('/account/certificates'),api('/account/deletion-request')]);if(location.hash!==expectedHash)return;state.dashboard=d;const owned=accessibleLessons(state.lessons,d,state.user.role);const {percent,next:nextOwned,completed:completedAccessible,total:accessibleTotal}=learningProgress(owned,d.progress);const tab=state.tab;const sessionStatus=tab==='profile'?await api('/account/sessions'):null;const nav=['overview','lessons','reviews','achievements','profile',...(state.user.role==='admin'?['admin']:[])];let body='';
if(tab==='overview'){
 const ownedCourses=d.enrollments.map(c=>{
  const stats=courseLearningProgress(c.id,state.lessons,d.progress);
  return '<a class="account-course" href="#/course"><div class="account-course-cover">'+mediaInline('account_course','account-course-image')+'<span>LEGWORK / ONLINE SCHOOL</span><strong>'+esc(c.title)+'</strong><span>YOUR PERSONAL PRACTICE</span></div><div class="account-course-info"><span>'+(c.tier==='guru'?'GURU · WITH FEEDBACK':'SELF-PACED')+'</span><div class="progress-bar" role="progressbar" aria-label="'+esc(c.title)+' progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+stats.percent+'"><i style="width:'+stats.percent+'%"></i></div><small>'+stats.completed+' / '+stats.total+' LESSONS · '+stats.percent+'% COMPLETE</small></div></a>';
 }).join('');
 const enrolledIds=new Set(d.enrollments.map(c=>Number(c.id)));
 const individuallyOwned=owned.filter(l=>d.lessonAccess.includes(l.id)&&!enrolledIds.has(Number(l.course_id)));
 const individualCards=individuallyOwned.map(l=>'<a class="account-library-lesson" href="#/study/'+l.id+'"><span class="eyebrow">INDIVIDUAL CLASS</span><strong>'+esc(l.title)+'</strong><small>'+esc(l.category||'Training')+' · '+esc(l.level||'All levels')+'</small><span class="account-library-open">OPEN LESSON ↗</span></a>').join('');
 const libraryCards=ownedCourses+individualCards;
 const feedbackSummary=d.mentorships.slice(0,2).map(m=>'<div class="account-feedback-entry"><div class="account-feedback-visual"><span>PRIVATE<br>FEEDBACK</span></div><div><strong>'+esc(m.package)+' REVIEW</strong><p>'+esc(m.feedback||'Waiting for your mentor’s response.')+'</p><span class="badge-label">'+esc(m.status)+'</span></div></div>').join('')||'<p class="description">Your personal reviews will appear here. <a href="#/mentorship">Explore mentorship</a></p>';
 body='<h2>HI, '+esc(state.user.name).toUpperCase()+'!</h2><div class="account-continue"><div class="account-continue-art"><span>LEGWORK</span><strong>LIKE A<br>BOSS.</strong></div><div class="account-continue-content"><p class="eyebrow">CONTINUE YOUR PRACTICE</p><h3>'+(nextOwned?esc(nextOwned.title):'Your next lesson awaits')+'</h3><div class="progress-bar" role="progressbar" aria-label="Accessible lesson progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><i style="width:'+percent+'%"></i></div><small>'+completedAccessible+' / '+accessibleTotal+' LESSONS · '+percent+'% COMPLETE</small></div>'+(nextOwned?'<a class="btn btn-red" href="#/study/'+nextOwned.id+'">CONTINUE</a>':btn('EXPLORE LESSONS','shop'))+'</div>'+
 '<div class="account-section-head"><h3>MY COURSES & LESSONS</h3><button data-tab="lessons" class="tiny-link">VIEW ALL</button></div><div class="grid grid-3 account-course-grid">'+(libraryCards||'<p class="description">Your accessible lessons will appear here. <a href="#/shop">Explore classes</a></p>')+'</div>'+
 '<div class="grid grid-2 account-panels"><div><div class="account-section-head"><h3>MY VIDEO REVIEWS</h3><button class="tiny-link" data-tab="reviews">VIEW ALL</button></div>'+feedbackSummary+'</div><div><div class="account-section-head"><h3>ACHIEVEMENTS</h3><button class="tiny-link" data-tab="achievements">VIEW ALL</button></div><div class="account-achievements"><div><strong>'+achievement.streak+'</strong><span>DAY STREAK</span></div><div><strong>'+achievement.badges.length+'</strong><span>TECHNIQUE BADGES</span></div><div><strong>'+achievement.completed+'</strong><span>LESSONS COMPLETED</span></div></div></div></div>'+
 '<div class="account-section-head"><h3>MY ORDERS</h3></div>'+(d.orders.map(o=>'<div class="item-row account-order-row"><span>'+esc(o.kind)+' #'+o.item_id+' · '+money(o.amount)+' · '+esc(o.plan||'self')+' · <b>'+esc(o.status)+'</b></span>'+(o.status==='pending'?'<button type="button" class="btn btn-outline btn-small" data-cancel-order="'+o.id+'">Cancel request</button>':'')+'</div>').join('')||'<p class="description">No orders yet.</p>');
}
if(tab==='overview'&&emailStatus.verification_required&&!emailStatus.verified)body='<div class="notice" role="alert"><b>Confirm your email address</b><p>We sent a verification link to '+esc(emailStatus.email)+'. Verify your email before buying classes or requesting mentorship. The link expires after 24 hours.</p><button type="button" id="resendVerification" class="btn btn-outline btn-small">RESEND VERIFICATION EMAIL</button></div>'+body;
if(tab==='overview')body+='<h3 style="margin-top:36px">PAYMENT CHECKOUT</h3>'+orderSelectionMarkup(d.orders,paymentConfig)+'<h3 style="margin-top:32px">PAYMENT HISTORY</h3>'+paymentHistoryMarkup(paymentHistory.payments,paymentConfig);
if(tab==='lessons')body='<h2>MY LESSONS</h2><p class="description">'+completedAccessible+' of '+accessibleTotal+' accessible lessons completed</p>'+(owned.length?'<div class="grid grid-3">'+owned.map(l=>lessonCard(l,true)).join('')+'</div>':'<div class="account-library-empty"><p>No classes in your library yet.</p><a class="btn btn-outline" href="#/shop">Explore classes</a></div>');
if(tab==='reviews')body='<h2>MY VIDEO REVIEWS</h2>'+(d.mentorships.map(m=>'<div class="item-row"><span class="badge-label">'+esc(m.status)+'</span><h3>'+esc(m.package)+'</h3><a href="'+esc(m.video_url)+'" target="_blank" rel="noopener noreferrer">Your video</a>'+(m.order_id?'<p class="meta">Order #'+m.order_id+' · '+(m.quoted_price_cents/100).toFixed(2)+' USD · '+m.turnaround_business_days+' business days after payment confirmation</p>':'<p class="meta">Price and response time to be confirmed by the school before payment.</p>')+'<p>'+esc(m.feedback||'Your mentor has not replied yet.')+'</p>'+(m.status==='awaiting_payment'?'<button type="button" class="btn btn-outline btn-small" data-cancel-mentorship="'+m.id+'">Cancel request</button>':'')+'</div>').join('')||'<p class="empty">No mentorship requests yet. <a href="#/mentorship">Explore mentorship</a></p>')+'<h3>HOMEWORK FEEDBACK</h3>'+(homeworkReviews.reviews.map(r=>'<div class="item-row"><h3>'+esc(r.title)+'</h3><p>'+esc(r.feedback)+'</p><p class="meta">'+esc(r.reviewed_at)+'</p></div>').join('')||'<p class="description">No homework reviews yet.</p>');
if(tab==='achievements')body='<h2>YOUR ACHIEVEMENTS</h2><div class="grid grid-3">'+card(achievement.completed+' lessons completed','Keep practicing, each session counts.','PROGRESS')+card(achievement.streak+' day streak','Open an accessible lesson or submit homework daily.','CONSISTENCY')+card(achievement.badges.length+' technique badges','Finish a lesson and attach homework to earn a badge.','BADGES')+'</div><h3>BADGE COLLECTION</h3><div class="grid grid-3">'+(achievement.badges.map(b=>card(b.title,'Unlocked','★ BADGE')).join('')||'<p>No badges yet.</p>')+'</div><h3>COURSE CERTIFICATES</h3>'+studentCertificatesMarkup(certificateData.certificates);
if(tab==='profile')body='<h2>PROFILE</h2><form class="form auth-panel" id="profileForm"><label>Your name<input name="name" class="field" required value="'+esc(state.user.name)+'"></label><label>Instagram username<input name="instagram" class="field" value="'+esc(state.user.instagram||'')+'"></label><label>Email<input class="field" disabled value="'+esc(state.user.email)+'"></label><button class="btn btn-red">SAVE PROFILE</button></form><h3 style="margin-top:35px">CHANGE PASSWORD</h3><form class="form auth-panel" id="passwordForm"><label>Current password<input class="field" type="password" autocomplete="current-password" name="current_password" required></label><label>New password (12+ characters)<input class="field" type="password" minlength="12" autocomplete="new-password" name="new_password" required></label><button class="btn btn-outline">CHANGE PASSWORD</button></form><button class="btn btn-outline" id="logout">LOG OUT</button>';
if(tab==='profile'){
 const closure=deletionStatus.request;
 body+='<section class="account-data-tools account-session-tools"><h3>'+(state.lang==='es'?'SEGURIDAD DE LA CUENTA':'ACCOUNT SECURITY')+'</h3><p>'+(state.lang==='es'?'Sesiones activas: ':'Active sign-ins: ')+'<strong>'+sessionStatus.active_sessions+'</strong> ('+(state.lang==='es'?'máximo ':'maximum ')+sessionStatus.max_sessions+'). '+(state.lang==='es'?'Puedes cerrar la sesión en los demás dispositivos si sospechas un acceso desconocido.':'You can sign out every other device if you suspect account sharing or an unknown login.')+'</p><form id="revokeSessionsForm" class="form"><label>'+(state.lang==='es'?'Contraseña actual':'Current password')+'<input class="field" type="password" name="password" autocomplete="current-password" required maxlength="128"></label><button class="btn btn-outline" type="submit">'+(state.lang==='es'?'CERRAR SESIÓN EN OTROS DISPOSITIVOS':'SIGN OUT OTHER DEVICES')+'</button></form></section>';
 body+='<section class="account-data-tools"><h3>MY PERSONAL DATA</h3><p>Download a copy of your profile, purchases, course progress, homework and feedback. Keep the file private.</p><a href="/api/account/data-export" class="btn btn-outline" download="legwork-my-data.json">DOWNLOAD MY DATA (JSON)</a></section>';
 if(state.user.role!=='admin'){
  body+='<section class="account-data-tools account-closure"><h3>REQUEST ACCOUNT CLOSURE</h3><p>This creates a request for the school to review. Your account, purchases and information will <strong>not</strong> be deleted immediately; financial retention obligations may apply.</p>'+
  (closure?'<p class="notice" role="status">Request status: <strong>'+esc(closure.status.replace('_',' '))+'</strong> · submitted '+esc(closure.created_at)+'</p>':
  '<form id="deletionRequestForm" class="form"><label>Confirm your current password<input class="field" name="password" type="password" autocomplete="current-password" required maxlength="128"></label><button type="submit" class="btn btn-outline">REQUEST ACCOUNT CLOSURE</button></form>')+'</section>';
 }
}
if(tab==='admin')body='<h2>ADMIN STUDIO</h2><p>Manage course access, lesson links and mentorship requests.</p><div id="adminMount"><p>Loading admin data…</p></div>';
layout('<div class="cabinet"><aside class="cabinet-nav">'+nav.map(n=>'<button data-tab="'+n+'" class="'+(n===tab?'active':'')+'">'+n.charAt(0).toUpperCase()+n.slice(1)+'</button>').join('')+'</aside><div class="cabinet-main">'+body+'</div></div>');if(tab==='admin')adminPanel()}
async function adminPanel(){try{const a=state.admin=await api('/admin/overview');$('#adminMount').innerHTML='<div class="grid grid-3">'+card(a.users.length+' USERS','Registered profiles','PEOPLE')+card(a.orders.filter(o=>o.status==='pending'&&o.kind!=='mentorship').length+' PENDING','Requires independent payment verification','ORDERS')+card(a.mentorships.filter(x=>x.status==='paid').length+' TO REVIEW','Paid requests awaiting feedback','MENTORSHIP')+'</div><h3>Purchase requests</h3><div class="stack">'+(a.orders.map(o=>'<div class="item-row row"><span>#'+o.id+' · '+esc(o.email)+' · '+esc(o.kind)+' '+o.item_id+' · '+money(o.amount)+' · '+o.status+'</span>'+(o.status==='pending'&&o.kind!=='mentorship'?'<button class="btn btn-small btn-outline" data-approve="'+o.id+'">APPROVE AFTER PAYMENT</button>':'')+'</div>').join('')||'<p>No orders yet.</p>')+'</div><h3>Give a student course access</h3><form id="enrollForm" class="form"><select name="user_id" required>'+a.users.filter(x=>x.role==='student').map(u=>'<option value="'+u.id+'">'+esc(u.email)+'</option>').join('')+'</select><select name="course_id">'+a.courses.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('')+'</select><button class="btn btn-dark">GRANT ACCESS</button></form><h3>Add a course</h3><form id="courseForm" class="form"><label>Course title<input class="field" name="title" placeholder="Course title" required></label><label>URL slug<input class="field" name="slug" placeholder="course-url-slug" required minlength="2" maxlength="80" pattern="[a-z0-9-]+"></label><label>Description<textarea class="field" name="description" placeholder="What students will learn"></textarea></label><label>Self-study price · USD cents<input class="field" type="number" min="0" max="100000000" step="1" name="price" value="16000" required></label><label>Guru package price · USD cents<input class="field" type="number" min="0" max="100000000" step="1" name="guru_price" value="36000" required></label><button class="btn btn-dark">ADD COURSE</button></form><h3>Add a lesson</h3><form id="lessonForm" class="form"><select name="course_id">'+a.courses.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('')+'</select><input class="field" name="title" placeholder="Lesson title" required><input class="field" name="category" placeholder="Category" value="Legwork"><input class="field" name="level" placeholder="Level" value="Beginner"><label>Lesson duration · minutes<input class="field" name="duration" type="number" min="1" max="600" step="1" value="12" required></label><input class="field" name="video_url" type="url" placeholder="Private YouTube lesson video URL"><input class="field" name="cover_url" type="text" placeholder="Public cover URL (https:// or /media/...)"><label>Lesson price · USD cents<input class="field" name="price" type="number" min="0" max="100000000" step="1" value="1500" required></label><label><input name="free" type="checkbox"> Free lesson (still requires an account)</label><button class="btn btn-dark">ADD LESSON</button></form><h3>MENTORSHIP REVIEW QUEUE</h3><div id="adminMentorshipQueue"><p>Loading requests…</p></div>';await adminMentorshipQueuePanel();await adminMentorshipOffersPanel();await adminExtras(a);renderAdminContentReadiness(a);await adminMaterialsPanel(a);await adminBundlePanel(a);await adminPaymentPanel();await adminMailPanel();await adminCertificatePanel();await adminEditorialPanel();await adminMediaPanel();await adminPrivacyPanel();await adminSecurityPanel();await adminRecoveryPanel();await adminOperationsPanel();await adminMfaPanel();translatePage($('#adminMount'),state.lang)}catch(e){if($('#adminMount'))$('#adminMount').textContent=e.message}}

function renderAdminContentReadiness(a){
 const mount=$('#adminMount');if(!mount)return;
 const lessons=a.lessons||[],courses=a.courses||[];
 const videos=lessons.filter(l=>!String(l.video_url||'').trim());
 const covers=lessons.filter(l=>!String(l.cover_url||'').trim());
 const descriptions=courses.filter(c=>!String(c.description||'').trim());
 const summary=(missing,total,unit)=>missing?missing+' of '+total+' '+unit+' need attention':'All '+total+' '+unit+' filled';
 const pending=lessons.filter(l=>!l.video_url||!l.cover_url);
 const priority=pending.slice(0,12).map(l=>{
  const flags=[!l.video_url?'Video':null,!l.cover_url?'Cover':null].filter(Boolean).join(' + ');
  return '<button type="button" class="admin-readiness-row" data-jump-admin="admin-lesson-detail-'+Number(l.id)+'" aria-label="Edit '+esc(l.title)+'; missing '+flags+'"><span><strong>'+esc(l.title)+'</strong><small>'+esc(l.category||'Class')+' · '+esc(flags)+' missing</small></span><span class="admin-readiness-open">EDIT ↗</span></button>';
 }).join('');
 const missingCourses=descriptions.slice(0,6).map(course=>
  '<button type="button" class="admin-readiness-row" data-jump-admin="admin-course-detail-'+Number(course.id)+'" aria-label="Edit '+esc(course.title)+'; missing description"><span><strong>'+esc(course.title)+'</strong><small>Course description missing</small></span><span class="admin-readiness-open">EDIT ↗</span></button>'
 ).join('');
 mount.insertAdjacentHTML('afterbegin','<section class="admin-content-readiness" aria-label="Course content readiness">'+
  '<div class="admin-readiness-heading"><div><p class="eyebrow">SCHOOL MATERIALS</p><h3>Complete your lesson library</h3></div>'+
  '<button type="button" class="btn btn-outline btn-small" data-jump-admin="adminLessonEditor">All lesson editors</button></div>'+
  '<div class="admin-readiness-stats">'+
   '<p><strong>'+esc(summary(videos.length,lessons.length,'videos'))+'</strong><span>Video sources</span></p>'+
   '<p><strong>'+esc(summary(covers.length,lessons.length,'covers'))+'</strong><span>Cover images</span></p>'+
   '<p><strong>'+esc(summary(descriptions.length,courses.length,'descriptions'))+'</strong><span>Descriptions</span></p></div>'+
  (pending.length?'<div class="admin-readiness-list"><h4>LESSONS TO COMPLETE <span>'+pending.length+' TOTAL</span></h4>'+priority+(pending.length>12?'<p class="description">Showing the first 12 lessons. Use All lesson editors to review the rest.</p>':'')+'</div>':
   '<p class="description">Every lesson has a video field and cover field filled. Check playback, image rights and access before publishing.</p>')+
  (descriptions.length?'<div class="admin-readiness-list"><h4>COURSES NEEDING A DESCRIPTION</h4>'+missingCourses+
   (descriptions.length>6?'<button type="button" class="admin-readiness-link" data-jump-admin="adminCourseEditor">Review all course descriptions</button>':'')+'</div>':'')+
  '<p class="description">This checklist checks fields only. Video permissions, licensing, email, payments and legal pages require separate verification.</p>'+
 '</section>');
}

async function adminMfaPanel(){
 const info=await api('/admin/mfa/status'),root=$('#adminMount');if(!root)return;
 root.insertAdjacentHTML('beforeend','<section class="admin-mfa-section" id="adminMfaArea">'+
  '<h3>ADMIN SECURITY · TWO-FACTOR AUTHENTICATION</h3>'+
  '<p class="description">Use a TOTP authenticator app. Backup codes are displayed only once; enabling MFA revokes other administrator sessions.</p>'+
  (info.enabled
   ?'<p><strong>ENABLED</strong> · '+Number(info.recovery_remaining)+' unused backup codes</p>'+
    '<form class="form" id="adminMfaDisable"><label>Current admin password<input class="field" type="password" name="password" autocomplete="current-password" required></label>'+
    '<label>Authenticator or backup code<input class="field" name="otp" required autocomplete="one-time-code"></label>'+
    '<button type="submit" class="btn btn-outline">Disable MFA and sign out all sessions</button></form>'
   :'<p><strong>NOT ENABLED</strong> — set up an authenticator to protect staff access.</p>'+
    '<form class="form" id="adminMfaSetup"><label>Confirm admin password<input class="field" name="password" type="password" autocomplete="current-password" required></label>'+
    '<button type="submit" class="btn btn-dark">Set up authenticator</button></form>')+
 '</section>');
}

async function adminOperationsPanel(){
 const data=await api('/admin/operations/status');
 const root=$('#adminMount');if(!root)return;
 const c=data.checks||{};
 const alertText=(data.alerts||[]).length
  ?data.alerts.map(a=>'<p class="meta"><strong>'+esc(a.level.toUpperCase())+'</strong> · '+esc(a.code.replaceAll('_',' '))+' · '+a.count+'</p>').join('')
  :'<p class="description">No active count-based alerts. Real delivery and external uptime monitoring have not been confirmed.</p>';
 root.insertAdjacentHTML('beforeend','<section class="admin-ops-status"><h3>OPERATIONS / INFRASTRUCTURE</h3>'+
  '<p class="description">Environment: '+esc(data.environment)+' · Snapshot: '+esc(new Date(data.checked_at).toLocaleString())+'. These are server-side aggregate counters, not proof of live provider delivery.</p>'+
  '<div class="grid grid-3">'+
   card(String(c.mail_pending||0)+' QUEUED / '+String(c.mail_failed||0)+' FAILED','Transactional outbox','EMAIL')+
   card(String(c.payments_require_review||0)+' REVIEW / '+String(c.payments_stale||0)+' STALE','Manual provider reconciliation required','PAYMENTS')+
   card(String(c.privacy_requests_open||0)+' OPEN','Account closure requests','PRIVACY')+
  '</div><h4>Action needed</h4>'+alertText+
  '<p class="description">Offsite backup verified: NO. This dashboard does not provide external alerts; keep payment processing disabled until its real merchant flow has been tested.</p></section>');
}

async function adminRecoveryPanel(){
 const info=await api('/admin/recovery'),root=$('#adminMount');if(!root)return;
 const heading='<h3>DATABASE RECOVERY POINTS</h3>';
 if(!info.supported){
  root.insertAdjacentHTML('beforeend','<section class="admin-recovery-section">'+heading+
   '<p class="description">Cloudflare point-in-time recovery is available only on the deployed SQLite Durable Object. This Node environment is not a recovery snapshot.</p></section>');
  return;
 }
 const points=(info.checkpoints||[]).map(x=>'<div class="item-row row"><div><strong>'+esc(x.label)+'</strong>'+
  '<p class="meta">Created '+esc(new Date(x.created_at).toLocaleString())+' · Expires about '+esc(new Date(x.expires_at).toLocaleDateString())+'</p></div>'+
  '<span class="badge-label">'+(x.expired?'EXPIRED / UNSAFE':'RECORDED')+'</span></div>').join('')||'<p class="description">No recovery checkpoints recorded yet.</p>';
 root.insertAdjacentHTML('beforeend','<section class="admin-recovery-section">'+heading+
  '<p class="description">Cloudflare keeps up to 30 days of SQLite and uploaded image history. These checkpoints are recovery bookmarks, NOT independently downloaded or permanent backups. No website action can restore or delete the database.</p>'+
  '<form class="form" id="recoveryCheckpointForm"><label>Recovery point label<input class="field" name="label" minlength="4" maxlength="80" placeholder="Before lesson import" required></label>'+
  '<label>Re-enter administrator password<input class="field" type="password" name="password" autocomplete="current-password" required></label>'+
  '<button class="btn btn-outline" type="submit">Record recovery point</button></form>'+
  '<h4>Recorded checkpoints</h4><div class="stack">'+points+'</div>'+
  '<p class="description">An actual restore requires a maintenance window, independent verification of payments and deliberate approval. Restore is intentionally not a dashboard action.</p>'+
  '</section>');
}

async function adminCertificatePanel(){const data=await api('/admin/certificates');const root=$('#adminMount');if(root)root.insertAdjacentHTML('beforeend',adminCertificatesMarkup(data))}
async function adminEditorialPanel(){const r=await api('/admin/content');const mount=$('#adminMount');if(mount)mount.insertAdjacentHTML('beforeend',editorialEditor(r))}
async function adminSecurityPanel(){
 const response=await api('/admin/security-audit?limit=35'),root=$('#adminMount');
 if(!root)return;
 const labels=state.lang==='es'?{
  heading:'ACTIVIDAD DE SEGURIDAD',
  description:'Registro de accesos, cambios de permisos y operaciones administrativas. No se almacenan contraseñas, cookies ni enlaces privados de YouTube.',
  empty:'No hay eventos de seguridad.',
  success:'CORRECTO',denied:'DENEGADO',failed:'FALLIDO'
 }:{
  heading:'SECURITY ACTIVITY',
  description:'Recent sign-ins, account access changes, and administrator decisions. Passwords, cookies and private YouTube links are never stored here.',
  empty:'No security events have been recorded.',
  success:'SUCCESS',denied:'DENIED',failed:'FAILED'
 };
 const rows=response.events.map(event=>{
  const when=new Date(event.occurred_at).toLocaleString(state.lang==='es'?'es-ES':'en-GB',{dateStyle:'medium',timeStyle:'short'});
  const actor=event.actor_name?esc(event.actor_name)+' (#'+event.actor_user_id+')':event.actor_user_id?'User #'+event.actor_user_id:'External / anonymous';
  const target=event.target_type?esc(event.target_type)+(event.target_id?' #'+esc(event.target_id):''):'';
  const extra=Object.entries(event.details||{}).map(([key,value])=>esc(key)+': '+esc(value)).join(' · ');
  const statusLabel=labels[event.outcome]||event.outcome.toUpperCase();
  return '<div class="item-row audit-event"><div class="audit-event-main"><strong>'+esc(event.action.replaceAll('.',' · '))+'</strong><span class="badge-label">'+esc(statusLabel)+'</span></div><p class="meta">'+esc(when)+' · '+actor+' · HTTP '+event.http_status+(target?' · '+target:'')+'</p>'+(extra?'<p class="meta">'+extra+'</p>':'')+'</div>';
 }).join('')||'<p class="description">'+esc(labels.empty)+'</p>';
 root.insertAdjacentHTML('beforeend','<section class="admin-security-section"><h3>'+esc(labels.heading)+'</h3><p class="description">'+esc(labels.description)+'</p><div class="stack">'+rows+'</div></section>');
}
async function adminPrivacyPanel(){
 const response=await api('/admin/deletion-requests');
 const root=$('#adminMount');if(!root)return;
 const list=response.requests.map(item=>'<div class="item-row account-privacy-request"><div><strong>'+esc(item.email)+'</strong><p class="meta">Request #'+item.id+' · '+esc(item.status)+' · '+esc(item.created_at)+'</p></div>'+(item.status==='pending'?'<button class="btn btn-outline btn-small" type="button" data-review-closure="'+item.id+'">Mark for review</button>':'<span class="badge-label">Under review</span>')+'</div>').join('')||'<p class="description">No account closure requests.</p>';
 root.insertAdjacentHTML('beforeend','<h3>ACCOUNT CLOSURE REQUESTS</h3><p class="description">A closure request is not deletion. Review purchases, retention requirements, backups and pending payments before acting. This panel does not erase user data.</p><div class="stack">'+list+'</div>');
}
async function adminMediaPanel(){
 const data=await api('/admin/media'),root=$('#adminMount');
 if(!root)return;
 const slots=data.slots.map(asset=>{
  const preview=asset.url?'<p class="description">Current: <a href="'+esc(asset.url)+'" target="_blank" rel="noopener noreferrer">Open approved media</a></p>':'<p class="description">No asset set. The website uses its current fallback.</p>';
  return '<details class="item-row media-admin-row"><summary><strong>'+esc(asset.label)+'</strong> <span class="badge-label">'+(asset.url?'SET':'EMPTY')+'</span></summary>'+
    '<form class="form" data-media-slot="'+esc(asset.key)+'">'+
    '<p class="description">Only publish media you own or have permission to use. This is a public '+esc(asset.type)+' slot; never paste private lesson recordings here.</p>'+preview+
    '<label>Public '+esc(asset.type)+' URL<input class="field" type="text" name="url" placeholder="https://..." value="'+esc(asset.url||'')+'"></label>'+(asset.type==='image'?'<label>Or upload an image from your computer (JPEG / PNG / WebP, max 6 MB)<input class="field" type="file" name="upload_image" accept="image/jpeg,image/png,image/webp"></label>':'')+
    '<label>Alternative text (required for images)<input class="field" name="alt" maxlength="160" value="'+esc(asset.alt||'')+'"></label>'+
    '<label>Photographer / source credit<input class="field" name="credit" maxlength="150" value="'+esc(asset.credit||'')+'"></label>'+
    '<label>Credit link (optional)<input class="field" type="url" name="source_url" value="'+esc(asset.source_url||'')+'"></label>'+
    '<button class="btn btn-dark" type="submit">Save media</button></form></details>';
 }).join('');
 root.insertAdjacentHTML('beforeend','<h3>PUBLIC MEDIA LIBRARY</h3><p class="description">Replace site photos, promo video and gallery visuals here without editing code. Leave a slot blank for its designed placeholder. Lesson covers are edited separately under Edit Full Lesson Details.</p><div class="stack">'+slots+'</div>');
}
async function adminExtras(a){
 const status=state.homeworkQueueStatus||'pending',page=Number(state.homeworkQueuePage)||0,limit=15;
 const [homework,waitlist]=await Promise.all([api('/admin/homework?status='+encodeURIComponent(status)+'&limit='+limit+'&offset='+(page*limit)),api('/admin/waitlist')]);
 const root=$('#adminMount');if(!root)return;
 const editCourses='<h3 id="adminCourseEditor" tabindex="-1">EDIT COURSES · PRICING & DESCRIPTION</h3><div class="stack">'+a.courses.map(c=>'<details class="item-row" id="admin-course-detail-'+Number(c.id)+'" tabindex="-1"><summary><b>'+esc(c.title)+'</b> · '+money(c.price)+'</summary><form class="form" data-course-edit="'+c.id+'"><label>Title<input class="field" name="title" required value="'+esc(c.title)+'"></label><label>Slug<input class="field" name="slug" required value="'+esc(c.slug)+'"></label><label>Description<textarea class="field" name="description">'+esc(c.description)+'</textarea></label><label>Price in US cents<input class="field" type="number" name="price" min="0" required value="'+c.price+'"></label><label>Guru package price (USD cents)<input class="field" type="number" name="guru_price" min="0" required value="'+c.guru_price+'"></label><button class="btn btn-dark">SAVE COURSE</button></form></details>').join('')+'</div>';
 const editLessons='<h3 id="adminLessonEditor" tabindex="-1">EDIT FULL LESSON DETAILS</h3><p class="description">Set a valid YouTube video link for each lesson, alongside its title, level, pricing and cover.</p><div class="admin-lesson-tools"><label>Find a lesson<input class="field" id="adminLessonSearch" type="search" placeholder="Title, direction or hashtag" autocomplete="off"></label><label>Show<select class="field" id="adminLessonStatus"><option value="all">All lessons</option><option value="missing-video">Missing video</option><option value="missing-cover">Missing cover</option><option value="complete">Video + cover assigned</option></select></label><p class="admin-lesson-count" id="adminLessonCount" role="status">Showing '+a.lessons.length+' of '+a.lessons.length+'</p></div><div class="stack" id="adminLessonList">'+a.lessons.map(l=>'<details class="item-row admin-edit-lesson" id="admin-lesson-detail-'+Number(l.id)+'" data-search="'+esc((l.title+' '+l.category+' '+(l.tags||'')).toLowerCase())+'" data-has-video="'+(String(l.video_url||'').trim()?'1':'0')+'" data-has-cover="'+(String(l.cover_url||'').trim()?'1':'0')+'" tabindex="-1"><summary>'+esc(l.title)+'</summary><form class="form" data-lesson-full="'+l.id+'"><label>Title<input class="field" name="title" required value="'+esc(l.title)+'"></label><div class="grid grid-2"><label>Category<input class="field" name="category" required value="'+esc(l.category)+'"></label><label>Type<input class="field" name="kind" required value="'+esc(l.kind)+'"></label><label>Level<input class="field" name="level" required value="'+esc(l.level)+'"></label><label>Duration in minutes<input class="field" name="duration" type="number" min="1" max="600" required value="'+l.duration+'"></label></div><label>Price in cents<input class="field" name="price" type="number" min="0" required value="'+l.price+'"></label><div class="grid grid-2"><label>Teacher<input class="field" name="teacher" value="'+esc(l.teacher||'Svitlana Yurchak')+'"></label><label>Equipment<input class="field" name="equipment" value="'+esc(l.equipment||'Any support')+'"></label><label>Training focus (comma-separated)<input class="field" name="focus" placeholder="Feet, Strength" value="'+esc(l.focus||'')+'"></label><label>Hashtags (comma-separated)<input class="field" name="tags" placeholder="#kneecircle" value="'+esc(l.tags||'')+'"></label></div><label>YouTube video link (public or unlisted)<input class="field" name="video_url" type="url" placeholder="https://www.youtube.com/watch?v=..." value="'+esc(l.video_url||'')+'"></label><p class="description">'+(state.lang==='es'?'Los enlaces de YouTube ocultos no aparecen en búsquedas, pero pueden compartirse si alguien los obtiene. La escuela protege el acceso a esta página.':'Unlisted YouTube links do not appear in search, but anyone who extracts the link can share it. The school only restricts access to this lesson page.')+'</p><label>Public cover image URL<input class="field" name="cover_url" type="text" placeholder="https:// or /media/..." value="'+esc(l.cover_url||'')+'"></label><label>Or upload a cover from your computer (JPEG / PNG / WebP, max 6 MB)<input class="field" type="file" name="upload_image" accept="image/jpeg,image/png,image/webp"></label><label><input name="free" type="checkbox" '+(l.free?'checked':'')+'> Introductory free lesson (account required)</label><button class="btn btn-dark" type="submit">SAVE LESSON</button></form></details>').join('')+'</div>';
 const homeworkCards='<h3>GURU HOMEWORK REVIEW QUEUE</h3><p class="description">Review only verified Guru assignments. Filter status and paginate instead of loading every private submission.</p><div class="row homework-queue-filters" role="group" aria-label="Homework status">'+['pending','reviewed','approved','all'].map(x=>'<button type="button" class="btn btn-small '+(status===x?'btn-dark':'btn-outline')+'" data-homework-status="'+x+'">'+x.toUpperCase()+' · '+Number(homework.totals?.[x]||0)+'</button>').join('')+'</div><div class="stack">'+(homework.homework.map(h=>'<div class="item-row"><p class="eyebrow">'+esc(h.course)+' · '+esc(h.email)+'</p><h3>'+esc(h.lesson)+'</h3><a href="'+esc(h.homework_url)+'" target="_blank" rel="noopener noreferrer">VIEW HOMEWORK</a><p class="meta">'+(h.reviewed_at?'Answered: '+esc(h.reviewed_at):'Awaiting review')+'</p><form class="form" data-homework-review="'+h.user_id+'-'+h.lesson_id+'"><label>Feedback<textarea class="field" rows="4" name="feedback" required>'+esc(h.feedback||'')+'</textarea></label><button class="btn btn-red">SAVE FEEDBACK</button></form><div class="row" style="margin-top:12px"><span class="badge-label">'+(h.approved?'APPROVED':'AWAITING APPROVAL')+'</span>'+(h.feedback?'<button type="button" class="btn btn-outline btn-small" data-homework-approval="'+h.user_id+'-'+h.lesson_id+'" data-approved="'+(h.approved?'false':'true')+'">'+(h.approved?'REVOKE APPROVAL':'APPROVE HOMEWORK')+'</button>':'')+'</div></div>').join('')||'<p class="empty">No Guru homework submissions in this filter.</p>')+'</div><div class="row homework-queue-paging"><button type="button" class="btn btn-outline btn-small" data-homework-page="'+(page-1)+'" '+(page?'':'disabled')+'>PREVIOUS</button><span>Page '+(page+1)+' · '+Number(homework.count||0)+' submissions</span><button type="button" class="btn btn-outline btn-small" data-homework-page="'+(page+1)+'" '+(homework.has_more?'':'disabled')+'>NEXT</button></div>';
 const leadList='<h3>WAITLIST SIGNUPS</h3><div class="stack">'+(waitlist.entries.map(x=>'<div class="item-row row"><b>'+esc(x.email)+'</b><span>'+esc(x.purpose)+' · '+esc(x.consent_at)+'</span></div>').join('')||'<p class="description">No subscribers yet.</p>')+'</div>';
 root.insertAdjacentHTML('beforeend',editCourses+editLessons+homeworkCards+leadList);
}

async function adminMentorshipOffersPanel(){
 const root=$('#adminMount');if(!root)return;
 const response=await api('/admin/mentorship/offers');
 const offers=(response.offers||[]).map(offer=>
  '<form class="form item-row" data-mentor-offer="'+esc(offer.package)+'"><h4>'+esc(offer.package)+' · '+(offer.published?'PUBLISHED':'NOT PUBLISHED')+'</h4>'+
  '<label>Approved price (USD cents)<input class="field" name="price_usd_cents" type="number" min="100" max="100000000" step="1" placeholder="Not set" value="'+(offer.price_usd_cents??'')+'"></label>'+
  '<label>Approved response time (business days after payment)<input class="field" name="turnaround_business_days" type="number" min="1" max="60" step="1" placeholder="Not set" value="'+(offer.turnaround_business_days??'')+'"></label>'+
  '<label><input type="checkbox" name="published" '+(offer.published?'checked':'')+'> Publish this exact price and turnaround</label>'+
  '<button class="btn btn-dark" type="submit">SAVE PACKAGE TERMS</button></form>').join('');
 root.insertAdjacentHTML('beforeend','<section class="admin-mentor-offers"><h3>MENTORSHIP · PACKAGE PRICES & PROMISED DEADLINES</h3>'+
  '<p class="description">Publish only instructor-approved prices and response times. Unpublished values are never shown as an offer. Existing requests keep their price snapshots. Publishing does not activate payment providers.</p>'+
  '<div class="grid grid-2">'+offers+'</div></section>');
}

async function adminMentorshipQueuePanel(){
 const root=$('#adminMentorshipQueue');if(!root)return;
 const status=state.mentorQueueStatus||'all',page=Number(state.mentorQueuePage)||0,limit=15;
 const data=await api('/admin/mentorship-queue?status='+encodeURIComponent(status)+'&limit='+limit+'&offset='+(page*limit));
 const filter=['all','paid','awaiting_payment','answered','cancelled'].map(x=>
  '<button class="btn btn-small '+(status===x?'btn-dark':'btn-outline')+'" type="button" data-mentor-status="'+x+'">'+x.replaceAll('_',' ').toUpperCase()+' · '+Number(data.totals?.[x]||0)+'</button>').join('');
 const rows=(data.requests||[]).map(m=>'<div class="item-row"><p class="eyebrow">'+esc(m.package)+' · '+esc(m.email)+' · '+esc(m.status)+'</p>'+
  '<p><strong>'+esc(m.name||'Student')+'</strong> · request #'+m.id+'</p>'+
  (m.order_id?'<p class="meta"><strong>Quoted order #'+m.order_id+'</strong> · '+(m.quoted_price_cents/100).toFixed(2)+' USD · '+m.turnaround_business_days+' business days · '+esc(m.order_status||'pending')+'</p>':'<p class="meta">Unquoted request; price and deadline to be confirmed manually</p>')+
  (m.payment_review_required?'<p class="notice">Payment requires reconciliation. Do not send feedback until cleared.</p>':'')+
  '<p class="description">'+esc(m.goals||'No goals provided')+'</p>'+
  (m.experience?'<p class="description"><b>Experience:</b> '+esc(m.experience)+'</p>':'')+
  '<p><a href="'+esc(m.video_url)+'" target="_blank" rel="noopener noreferrer">Open private video link in a new tab</a></p>'+
  (m.status==='awaiting_payment'?'<button type="button" class="btn btn-outline btn-small" data-pay="'+m.id+'">MARK PAYMENT VERIFIED (AFTER CHECKING)</button>':
   ['paid','answered'].includes(m.status)&&!m.payment_review_required?'<form class="form" data-feedback="'+m.id+'"><label>Private teacher feedback<textarea class="field" name="feedback" rows="4" required>'+esc(m.feedback||'')+'</textarea></label><button type="submit" class="btn btn-small btn-red">'+(m.status==='answered'?'UPDATE FEEDBACK':'SEND PRIVATE FEEDBACK')+'</button></form>':'')+
  '</div>').join('');
 root.innerHTML='<p class="description">These requests are private. Payment verification must be done independently; no card is charged from this screen.</p>'+
  '<div class="row mentor-queue-filters" role="group" aria-label="Mentorship status">'+filter+'</div>'+
  '<div class="stack">'+(rows||'<p class="empty">No requests in this filter.</p>')+'</div>'+
  '<div class="row mentor-queue-paging"><button class="btn btn-outline btn-small" type="button" data-mentor-page="'+(page-1)+'" '+(page?'':'disabled')+'>PREVIOUS</button>'+
  '<span>Page '+(page+1)+' · '+Number(data.count||0)+' requests</span>'+
  '<button class="btn btn-outline btn-small" type="button" data-mentor-page="'+(page+1)+'" '+(data.has_more?'':'disabled')+'>NEXT</button></div>';
}

async function adminMaterialsPanel(a){
 const root=$('#adminMount'),lessons=a.lessons||[];if(!root)return;
 if(!lessons.length){root.insertAdjacentHTML('beforeend','<p>Add lessons to publish PDF materials.</p>');return}
 const selected=lessons.some(l=>l.id===state.adminMaterialLessonId)?state.adminMaterialLessonId:lessons[0].id;
 state.adminMaterialLessonId=selected;
 const result=await api('/learning/'+selected+'/materials');
 const rows=(result.materials||[]).map(m=>'<div class="item-row row"><span><strong>'+esc(m.title)+'</strong> · '+Math.ceil(m.bytes/1024)+' KB</span><span class="row"><a class="btn btn-outline btn-small" href="/api/learning/materials/'+m.id+'/download" download>PDF ↓</a><button type="button" class="btn btn-outline btn-small" data-remove-material="'+m.id+'">REMOVE</button></span></div>').join('');
 const options=lessons.map(l=>'<option value="'+l.id+'"'+(l.id===selected?' selected':'')+'>'+esc(l.title)+'</option>').join('');
 root.insertAdjacentHTML('beforeend','<section class="admin-study-files"><h3>PRIVATE LESSON PDF MATERIALS</h3>'+
  '<p class="description">PDFs are downloadable only by students who have access to this lesson. Max 1 MiB per PDF, ten per lesson. Never upload student recordings here.</p>'+
  '<label>Select lesson<select id="adminMaterialLesson" class="field">'+options+'</select></label>'+
  '<div class="stack">'+(rows||'<p class="description">No PDF notes published for this lesson.</p>')+'</div>'+
  '<form id="adminLessonMaterialForm" class="form"><label>Material title<input class="field" type="text" name="title" maxlength="100" required placeholder="Technique checklist"></label>'+
  '<label>Course PDF (max 1 MiB)<input class="field" type="file" name="pdf" accept="application/pdf" required></label>'+
  '<button type="submit" class="btn btn-dark">PUBLISH PRIVATE PDF</button></form></section>');
}

async function adminMailPanel(){
 const response=await api('/admin/email-outbox'),root=$('#adminMount');if(!root)return;
 const counts=Object.fromEntries((response.stats||[]).map(row=>[row.status,row.n]));
 const delivery=Object.fromEntries((response.delivery||[]).map(row=>[row.status,row.n]));
 const method=response.provider==='resend'?'Resend HTTPS':response.provider==='smtp'?'SMTP':response.provider==='test'?'Test transport':'Not configured';
 const configured=response.enabled?'Sender transport configured ('+method+'). This does not prove email reached a real mailbox.':'Verify a sending domain and configure credentials before allowing production registration.';
 const delivered=Number(delivery.delivered||0),bounced=Number(delivery.bounced||0),complained=Number(delivery.complained||0);
 const delayed=Number(delivery.delayed||0),providerFailed=Number(delivery.failed||0)+Number(delivery.suppressed||0);
 const webhook=response.provider!=='resend'?'No Resend webhook is needed for this transport.':
  response.webhook_configured?'Webhook signature verification configured. Delivery metrics depend on real Resend callbacks.':
   'Missing RESEND_WEBHOOK_SECRET: accepted messages cannot be independently tracked as delivered, bounced or complained.';
 root.insertAdjacentHTML('beforeend','<section class="admin-mail-health"><h3>EMAIL DELIVERY HEALTH</h3><div class="grid grid-3">'+
  card(response.registration_open?'OPEN':'CLOSED',response.registration_open?'New students may register. Continue monitoring sender delivery and password resets.':'Public registration stays closed until the verified email sender is tested and REGISTRATION_OPEN is explicitly set to true.','STUDENT REGISTRATION')+
  card(response.enabled?'CONFIGURED':'NOT CONFIGURED',configured,'SENDING PROVIDER')+
  card(String(counts.sent||0)+' ACCEPTED','Resend/SMTP accepted the request. This is not evidence of actual inbox placement.','OUTBOX')+
  card(String(delivered)+' DELIVERED','Resend confirmed delivery to a receiving mail server, not placement in inbox.','WEBHOOKS')+
  card(String(counts.pending||0)+' QUEUED / '+String(counts.failed||0)+' FAILED','Transport retry queue; automatic retries stop after eight attempts.','RETRY QUEUE')+
  card(String(bounced)+' BOUNCED / '+String(complained)+' COMPLAINTS','Provider reported permanent rejection or a spam complaint.','DELIVERY ISSUES')+
  card(String(delayed)+' DELAYED / '+String(providerFailed)+' FAILED','Provider is attempting again, or has returned a final failure.','PROVIDER STATUS')+
  '</div><p class="description">'+esc(webhook)+'</p>'+
  '<p class="description">'+Number(response.suppressed||0)+' addresses locally suppressed after provider rejection or complaint. Suppressed recipients are never automatically retried.</p>'+
  ((counts.failed||0)>0?'<p><button class="btn btn-outline btn-small" id="retryEmailDelivery" type="button" '+(response.enabled?'':'disabled')+'>Retry up to 10 failed emails</button></p>':'')+
  '<p class="description">Launch check: register a disposable student on the deployed site; confirm its email and reset password in a real inbox. Check sender DNS and Resend logs. Never paste secrets into this dashboard.</p></section>');
 if(Number(response.suppressed||0)>0){
  const data=await api('/admin/email-suppressions');
  const rows=(data.suppressed||[]).map(item=>
   '<form class="form admin-suppressed-address" data-release-suppression="'+esc(item.email)+'">'+
    '<p><strong>'+esc(item.email)+'</strong> · '+esc(item.reason)+' · '+esc(new Date(item.recorded_at).toLocaleString())+'</p>'+
    '<label>Confirm administrator password<input type="password" class="field" name="password" autocomplete="current-password" required></label>'+
    '<button type="submit" class="btn btn-outline btn-small">Release local suppression</button></form>').join('');
  root.insertAdjacentHTML('beforeend','<section class="admin-suppressions"><h3>BOUNCED / COMPLAINT ADDRESSES</h3>'+
   '<p class="description">Release only after verifying a corrected address and checking the Resend suppression list. Releasing does not re-subscribe anyone to marketing.</p>'+
   '<div class="stack">'+rows+'</div></section>');
 }

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
function setMobileMenu(open){if(!open){document.querySelector('.header-course-menu')?.classList.remove('is-open');document.querySelector('#courseMenuToggle')?.setAttribute('aria-expanded','false');}
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
async function navigate(){closeCart(false);setMobileMenu(false);window.scrollTo(0,0);const route=(location.hash.startsWith('#/')?location.hash.slice(2):location.pathname.replace(/^\//,'')).split('?')[0];try{if(route==='')home();else if(route==='course'||route.startsWith('course#'))course();else if(route==='shop')shop();else if(route.startsWith('lesson/'))lesson(route);else if(route.startsWith('bundle/'))bundlePage(route);else if(route.startsWith('verify-certificate/'))await verifyCertificateView(route.split('/')[1],{api,layout});else if(route.startsWith('payment/')){if(!state.user)authPage(false);else await renderPaymentStatus(Number(route.split('/')[1]),{api,layout,notice})}else if(route.startsWith('study/')){if(!state.user)authPage(false);else await renderStudy(Number(route.split('/')[1]),{api,layout,notice,lang:state.lang})}else if(route.startsWith('mentorship'))mentorship();else if(route==='forgot-password')forgotPasswordPage();else if(route.startsWith('reset-password/'))resetPasswordPage(route.split('/')[1]);else if(route.startsWith('verify-email/'))await verifyEmailPage(route.split('/')[1]);else if(route.startsWith('unsubscribe/'))unsubscribePage(route.split('/')[1]);else if(route==='login')authPage();else if(route==='register')authPage(true);else if(route==='account')await account();else home();if(location.hash.includes('#prices')||location.hash.includes('#request'))setTimeout(()=>document.getElementById(location.hash.split('#').pop())?.scrollIntoView({behavior:'smooth'}),50)}catch(e){if(location.hash==='#/'+route||location.hash.startsWith('#/'+route+'?'))layout(section('Unable to load',esc(e.message)));}}
async function init(){
 // A partial outage (including missing deployment secrets) must never hide
 // all public content. Authentication and purchases remain server-controlled.
 const results=await Promise.allSettled([
  api('/me'),api('/courses'),api('/lessons'),
  api('/bundles'),api('/content'),api('/media'),api('/mentorship/offers'),api('/email/config')
 ]);
 const data=results.map(r=>r.status==='fulfilled'?r.value:null);
 state.user=data[0]?.user||null;
 state.courses=Array.isArray(data[1]?.courses)?data[1].courses:[];
 state.lessons=Array.isArray(data[2]?.lessons)?data[2].lessons:[];
 state.bundles=Array.isArray(data[3]?.bundles)?data[3].bundles:[];
 state.content=data[4]?.pages||EDITORIAL_DEFAULTS;
 state.media=data[5]?.assets||{};
 state.mentorshipOffers=Array.isArray(data[6]?.offers)?data[6].offers:[];
 state.registrationOpen=data[7]?.registration_open===true;
 state.serviceIssue=results.some(r=>r.status==='rejected');
 await navigate();
}
const formData=form=>Object.fromEntries(new FormData(form));
function updateAdminLessonFilter(){
 const search=($('#adminLessonSearch')?.value||'').trim().toLowerCase();
 const status=$('#adminLessonStatus')?.value||'all';
 const cards=[...document.querySelectorAll('#adminLessonList .admin-edit-lesson')];
 let shown=0;
 for(const card of cards){
  const hasVideo=card.dataset.hasVideo==='1',hasCover=card.dataset.hasCover==='1';
  const matches=(!search||(card.dataset.search||'').includes(search))&&(
   status==='all'||(status==='missing-video'&&!hasVideo)||
   (status==='missing-cover'&&!hasCover)||(status==='complete'&&hasVideo&&hasCover)
  );
  card.hidden=!matches;
  if(matches)shown++;
 }
 const label=$('#adminLessonCount');
 if(label)label.textContent='Showing '+shown+' of '+cards.length;
}

async function action(e){const target=e.target,form=target.closest('form'),button=target.closest('button,a');try{
if(form&&e.type==='submit'){e.preventDefault();const data=formData(form);
if(form.id==='forgotPasswordForm'){const response=await api('/auth/forgot-password','POST',{email:data.email});notice(response.message);form.reset();return}
else if(form.id==='resetPasswordForm'){
 if(data.password!==data.confirm_password){notice('Passwords do not match');return}
 const token=location.hash.split('/').pop();
 const response=await api('/auth/reset-password','POST',{token,password:data.password});
 state.user=null;state.tab='overview';location.hash='#/login';await navigate();notice(response.message);return
}
else if(form.id==='authForm'){const r=await api('/auth/'+data.mode,'POST',data);state.user=r.user;state.tab='overview';if(location.hash==='#/account')await navigate();else location.hash='#/account'}
else if(form.id==='mentorshipForm'){if(!state.user){location.hash='#/login';notice('Log in before sending a mentorship request');return}const r=await api('/mentorships','POST',data);notice(r.message);location.hash='#/account'}
else if((form.id==='subscribeForm'||form.id==='footerSubscribeForm')){const r=await api('/subscribe','POST',{email:data.email,purpose:data.purpose,consent:true});notice(r.message);form.reset();if(data.purpose==='free-lesson'){const free=state.lessons.find(l=>l.free);if(free){const current=$('#freeLessonNext');current?.remove();form.insertAdjacentHTML('afterend','<p id="freeLessonNext" role="status" class="free-lesson-next"><a href="#/lesson/'+free.id+'">Open your free introductory lesson →</a></p>')}}}
else if(form.id==='unsubscribeForm'){const result=await api('/subscriptions/unsubscribe','POST',{token:data.token});layout(section('EMAIL PREFERENCES','<p>'+esc(result.message)+'</p>'+btn('Return to the school',''),'','','muted-section'));notice(result.message);return}
else if(form.id==='revokeSessionsForm'){const r=await api('/account/sessions/revoke-others','POST',{password:data.password});notice(r.message);await account();return}
else if(form.id==='deletionRequestForm'){if(!askConfirmation('Send an account closure request for manual review? Your account will stay active until the school processes it.'))return;const result=await api('/account/deletion-request','POST',{password:data.password});await account();notice(result.message);return}
else if(form.id==='profileForm'){await api('/profile','PATCH',data);state.user.name=data.name;state.user.instagram=data.instagram;notice('Profile saved');await account()}
else if(form.id==='passwordForm'){const result=await api('/account/change-password','POST',data);state.user=null;state.tab='overview';location.hash='#/login';await navigate();notice(result.message)}
else if(form.dataset.editorPage){const page=form.dataset.editorPage,lang=form.dataset.editorLang,revision=Number(form.dataset.revision);await api('/admin/content/'+page+'/'+lang,'PUT',{values:data,expected_revision:revision});state.content=(await api('/content')).pages;notice('Page text updated for '+lang.toUpperCase());await adminPanel();return}
else if(form.dataset.releaseSuppression){
 if(!askConfirmation('Release this local email suppression? First verify the address and check the Resend suppression dashboard.'))return;
 const response=await api('/admin/email-suppressions/release','POST',{email:form.dataset.releaseSuppression,password:data.password});
 notice(response.message);
 await adminPanel();
 return;
}
else if(form.id==='adminMfaSetup'){
 const result=await api('/admin/mfa/setup','POST',{password:data.password});
 const root=$('#adminMfaArea');if(!root)return;
 root.querySelector('#adminMfaSetup')?.remove();
 root.insertAdjacentHTML('beforeend','<div><p><strong>STEP 1</strong> Enter this private secret into your authenticator (LEGWORK · Admin). Never share it.</p>'+
  '<p class="admin-mfa-secret"><code>'+esc(result.secret)+'</code></p>'+
  '<p><strong>STEP 2</strong> Confirm the current six-digit authenticator code.</p>'+
  '<form class="form" id="adminMfaEnable"><label>Admin password<input class="field" type="password" name="password" autocomplete="current-password" required></label>'+
  '<label>6-digit code<input class="field" name="otp" inputmode="numeric" autocomplete="one-time-code" required pattern="[0-9]{6}"></label>'+
  '<button type="submit" class="btn btn-red">Enable two-factor authentication</button></form></div>');
 return;
}
else if(form.id==='adminMfaEnable'){
 const result=await api('/admin/mfa/enable','POST',{password:data.password,otp:data.otp});
 const region=$('#adminMfaArea');if(!region)return;
 region.innerHTML='<h3>TWO-FACTOR AUTHENTICATION ENABLED</h3>'+
  '<p><strong>Save these one-time recovery codes in your private password manager now.</strong> They cannot be displayed again.</p>'+
  '<pre class="admin-mfa-recovery">'+(result.recovery_codes||[]).map(esc).join('\\n')+'</pre>'+
  '<p>Sign out and test your authenticator and one unused recovery code only when needed.</p>';
 return;
}
else if(form.id==='adminMfaDisable'){
 if(!askConfirmation('Disable administrator MFA and revoke all admin sessions?'))return;
 const result=await api('/admin/mfa/disable','POST',{password:data.password,otp:data.otp});
 state.user=null;location.hash='#/login';await navigate();notice(result.message);return;
}
else if(form.id==='recoveryCheckpointForm'){if(!askConfirmation('Record a 30-day recovery bookmark for the Cloudflare database?'))return;const result=await api('/admin/recovery/checkpoints','POST',{label:data.label,password:data.password});notice(result.message);await adminPanel();return}
else if(form.dataset.mentorOffer){
 const price=data.price_usd_cents===''?null:Number(data.price_usd_cents);
 const days=data.turnaround_business_days===''?null:Number(data.turnaround_business_days);
 const published=form.querySelector('[name="published"]')?.checked===true;
 if(published&&!askConfirmation('Publish these exact instructor-approved package terms for NEW requests?'))return;
 await api('/admin/mentorship/offers/'+encodeURIComponent(form.dataset.mentorOffer),'PATCH',
  {price_usd_cents:price,turnaround_business_days:days,published});
 state.mentorshipOffers=(await api('/mentorship/offers')).offers;
 notice('Mentorship terms saved');await adminPanel();return;
}
else if(form.id==='adminLessonMaterialForm'){
 const file=form.querySelector('[name="pdf"]')?.files?.[0];
 if(!file||file.type!=='application/pdf'||file.size>1024*1024){notice('Choose a PDF up to 1 MiB');return}
 const title=String(data.title||'').trim(),id=Number(state.adminMaterialLessonId);
 if(!title||!id)return;
 const res=await fetch('/api/admin/lessons/'+id+'/materials?title='+encodeURIComponent(title),{
  method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/pdf','Origin':location.origin},body:file
 });
 const result=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(result.error||'PDF upload failed');
 notice('Private lesson PDF published');await adminPanel();return;
}
else if(form.id==='enrollForm'){await api('/admin/enroll','POST',{user_id:Number(data.user_id),course_id:Number(data.course_id)});notice('Access granted');await adminPanel()}
else if(form.id==='courseForm'){await api('/admin/courses','POST',{...data,price:Number(data.price),guru_price:Number(data.guru_price)});state.courses=(await api('/courses')).courses;notice('Course created');await adminPanel()}
else if(form.id==='lessonForm'){await api('/admin/lessons','POST',{...data,course_id:Number(data.course_id),price:Number(data.price),duration:Number(data.duration),free:form.querySelector('[name=free]').checked});state.lessons=(await api('/lessons')).lessons;notice('Lesson created');await adminPanel()}
else if(form.dataset.feedback){await api('/admin/mentorships/'+form.dataset.feedback,'PATCH',{feedback:data.feedback});notice('Feedback sent to student account');await adminPanel()}
else if(form.dataset.mediaSlot){const selected=form.querySelector('[name="upload_image"]')?.files?.[0];if(selected?.size)data.url=await uploadPublicImage(selected);delete data.upload_image;const result=await api('/admin/media/'+encodeURIComponent(form.dataset.mediaSlot),'PATCH',data);state.media=(await api('/media')).assets;notice('Media updated');await adminPanel();return}
else if(form.dataset.courseEdit){await api('/admin/courses/'+form.dataset.courseEdit,'PATCH',{...data,price:Number(data.price),guru_price:Number(data.guru_price)});state.courses=(await api('/courses')).courses;notice('Course updated');await adminPanel()}
else if(form.dataset.lessonFull){const selected=form.querySelector('[name="upload_image"]')?.files?.[0];if(selected?.size)data.cover_url=await uploadPublicImage(selected);delete data.upload_image;await api('/admin/lessons/'+form.dataset.lessonFull+'/full','PATCH',{...data,price:Number(data.price),duration:Number(data.duration),free:form.querySelector('[name=free]').checked});state.lessons=(await api('/lessons')).lessons;notice('Lesson details updated');await adminPanel()}
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
if(target.id==='shopFilterShade'){e.preventDefault();document.querySelector('#shopFiltersClose')?.click();return}
 if(!button||e.type!=='click')return;
 if(button.id==='courseMenuToggle'){
   e.preventDefault();
   const shell=document.querySelector('.header-course-menu');
   const open=!shell?.classList.contains('is-open');
   shell?.classList.toggle('is-open',open);
   button.setAttribute('aria-expanded',String(open));
   return;
  }
  if(button.dataset.mentorStatus){
  e.preventDefault();state.mentorQueueStatus=button.dataset.mentorStatus;state.mentorQueuePage=0;await adminMentorshipQueuePanel();return;
 }
 if(button.dataset.mentorPage){
  e.preventDefault();state.mentorQueuePage=Math.max(0,Number(button.dataset.mentorPage)||0);await adminMentorshipQueuePanel();return;
 }
 if(button.dataset.homeworkStatus){
  e.preventDefault();state.homeworkQueueStatus=button.dataset.homeworkStatus;state.homeworkQueuePage=0;await adminPanel();return;
 }
 if(button.dataset.homeworkPage){
  e.preventDefault();state.homeworkQueuePage=Math.max(0,Number(button.dataset.homeworkPage)||0);await adminPanel();return;
 }
 if(button.dataset.removeMaterial){
  e.preventDefault();
  if(!askConfirmation('Remove this private PDF from the lesson?'))return;
  await api('/admin/materials/'+button.dataset.removeMaterial,'DELETE');
  notice('Private lesson PDF removed');await adminPanel();return;
 }
 if(button.dataset.programMode){
  e.preventDefault();
  const grid=$('#courseProgramGrid');if(!grid)return;
  const mode=button.dataset.programMode==='carousel'?'carousel':'grid';
  grid.classList.toggle('is-carousel',mode==='carousel');
  document.querySelectorAll('[data-program-mode]').forEach(control=>{
   control.setAttribute('aria-pressed',String(control.dataset.programMode===mode));
  });
  return;
 }

 if(button.dataset.jumpAdmin){
  e.preventDefault();
  const el=document.getElementById(button.dataset.jumpAdmin);
  if(el){
   // A readiness shortcut must still work after a manual lesson filter.
   if(el.hidden&&el.classList.contains('admin-edit-lesson')){
    const search=$('#adminLessonSearch'),status=$('#adminLessonStatus');
    if(search)search.value='';
    if(status)status.value='all';
    updateAdminLessonFilter();
   }
   if(el.tagName==='DETAILS')el.open=true;
   const focusTarget=el.tagName==='DETAILS'?el.querySelector('summary')||el:el;
   focusTarget.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
   focusTarget.focus({preventScroll:true});
  }
  return;
 }
 if(button.dataset.homeSlide){e.preventDefault();const track=$('#home-'+button.dataset.homeTarget+'-track'),item=track?.querySelector('.home-carousel-item');if(track&&item){const gap=parseFloat(getComputedStyle(track).columnGap)||0;track.scrollBy({left:(item.getBoundingClientRect().width+gap)*(button.dataset.homeSlide==='next'?1:-1),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}return}

 if(button.id==='shopFiltersToggle'||button.id==='shopFiltersClose'||button.id==='shopFilterShade'){
  const panel=$('#shopFilterPanel'),shade=$('#shopFilterShade'),toggle=$('#shopFiltersToggle');
  if(!panel||!shade||!toggle)return;
  const open=button.id==='shopFiltersToggle'?!panel.classList.contains('is-open'):false;
  panel.classList.toggle('is-open',open);
  shade.hidden=!open;
  toggle.setAttribute('aria-expanded',String(open));
  document.body.classList.toggle('shop-filters-open',open);
  if(open)$('#shopFiltersClose')?.focus();else toggle.focus();
  return
 }
 if(button.id==='shopSearchApply'){
  e.preventDefault();clearTimeout(shopSearchTimer);
  const input=$('#shopSearch');applyShopSearch(input?.value||'',true,input?.selectionStart??null);return;
 }
 if(button.dataset.shopSearchClear){
  e.preventDefault();clearTimeout(shopSearchTimer);applyShopSearch('',false);return;
 }
 if(button.dataset.shopFilter){
  const key=button.dataset.shopFilter,value=button.dataset.shopValue||'',params=new URLSearchParams(location.hash.split('?')[1]||'');
  params.get(key)===value?params.delete(key):params.set(key,value);
  location.hash='#/shop'+(params.toString()?'?'+params.toString():'');
  return
 }
 if(button.dataset.shopClear){location.hash='#/shop';return}
if(button.dataset.showtab){e.preventDefault();document.querySelectorAll('[data-showtab]').forEach(el=>{const selected=el===button;el.classList.toggle('active',selected);el.setAttribute('aria-selected',String(selected))});const topics={championships:['CHAMPIONSHIPS','Competitions and performances across the international pole community.'],shows:['SHOWS','Stage performances and international dance appearances.'],judging:['JUDGING & POLECON','Experience teaching and judging at international events.']};const [title,body]=topics[button.dataset.showtab]||topics.championships;const panel=$('#showsPanel');if(panel){panel.innerHTML='<h3>'+title+'</h3><p>'+body+'</p>';panel.setAttribute('aria-labelledby',button.id)}return}
 if(button.dataset.message){e.preventDefault();notice(button.dataset.message)}
if(button.dataset.tab){state.tab=button.dataset.tab;await account()}
if(button.dataset.reviewClosure){const result=await api('/admin/deletion-requests/'+Number(button.dataset.reviewClosure)+'/review','POST',{});notice(result.message);await adminPanel();return}
if(button.dataset.cancelOrder){if(!askConfirmation('Cancel this unpaid order request?'))return;const r=await api('/orders/'+Number(button.dataset.cancelOrder)+'/cancel','POST',{});notice(r.message);await account();return}
if(button.dataset.cancelMentorship){if(!askConfirmation('Cancel this mentorship request before payment?'))return;const r=await api('/mentorships/'+Number(button.dataset.cancelMentorship)+'/cancel','POST',{});notice(r.message);await account();return}
if(button.id==='retryEmailDelivery'){if(!askConfirmation('Retry failed emails after verifying the sender and delivery settings?'))return;const result=await api('/admin/email-outbox/retry','POST',{});notice(result.message);await adminPanel();return}
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
 if(button.dataset.package){
  sessionStorage.setItem('legwork_package',button.dataset.package);
  const select=$('#mentorshipPackage');
  if(select){
   select.value=button.dataset.package;
   $('#deepFields')?.classList.toggle('hidden',button.dataset.package!=='Deep');
   document.querySelectorAll('.mentor-plan-toggle [data-package]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.package===button.dataset.package)));
  }
 }
if(button.id==='requestCart'){if(!state.user){location.hash='#/login';notice('Log in to request purchase');return}const items=state.cart.slice(),packages=state.bundleCart.slice();if(!items.length&&!packages.length){notice('Your bag is empty');return}const result=await api('/orders/batch','POST',{lesson_ids:items,bundle_ids:packages});state.cart=[];state.bundleCart=[];updateCart();closeCart();notice(result.message);location.hash='#/account'}
}catch(err){notice(err.message)}}
document.addEventListener('change',e=>{
 if(e.target?.id==='adminMaterialLesson'){
  state.adminMaterialLessonId=Number(e.target.value);adminPanel().catch(error=>notice(error.message));
 }
});
document.addEventListener('click',action);document.addEventListener('submit',async e=>{if(e.target.id==='progressForm'){e.preventDefault();try{const d=formData(e.target);await api('/progress/'+d.lesson_id,'POST',{completed:true,homework_url:d.homework_url});notice('Progress saved')}catch(err){notice(err.message)}return}action(e)});
$('#menuBtn').onclick=()=>setMobileMenu(!$('#nav').classList.contains('open'));
$('#nav').addEventListener('click',e=>{if(e.target.closest('a'))setMobileMenu(false)});
$('#cartBtn').onclick=showCart;$('#closeCart').onclick=()=>closeCart();$('#shade').onclick=()=>closeCart();
document.addEventListener('keydown',e=>{
 const drawer=$('#cartDrawer');
 if(e.key==='Escape'){
  if(drawer.classList.contains('open')){e.preventDefault();closeCart();return}
  if($('#shopFilterPanel')?.classList.contains('is-open')){$('#shopFilterPanel').classList.remove('is-open');$('#shopFilterShade').hidden=true;$('#shopFiltersToggle').setAttribute('aria-expanded','false');document.body.classList.remove('shop-filters-open');$('#shopFiltersToggle').focus();return}
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
document.addEventListener('change',e=>{if(e.target.id==='adminLessonStatus'){updateAdminLessonFilter();return}if(e.target.id==='mentorshipPackage'){$('#deepFields')?.classList.toggle('hidden',e.target.value!=='Deep');sessionStorage.setItem('legwork_package',e.target.value)}if(['filterCategory','filterLevel','filterKind','filterTeacher','filterEquipment','filterFocus','filterDuration'].includes(e.target.id)){const p=new URLSearchParams(location.hash.split('?')[1]||'');const key={filterCategory:'category',filterLevel:'level',filterKind:'kind',filterTeacher:'teacher',filterEquipment:'equipment',filterFocus:'focus',filterDuration:'duration'}[e.target.id];e.target.value?p.set(key,e.target.value):p.delete(key);location.hash='#/shop?'+p;}});document.addEventListener('input',e=>{if(e.target.id==='adminLessonSearch'){updateAdminLessonFilter();return}if(e.target.id!=='shopSearch')return;clearTimeout(shopSearchTimer);const value=e.target.value,caret=e.target.selectionStart;shopSearchTimer=setTimeout(()=>applyShopSearch(value,true,caret),300)});document.addEventListener('keydown',e=>{if(e.target.id==='shopSearch'&&e.key==='Enter'){e.preventDefault();clearTimeout(shopSearchTimer);applyShopSearch(e.target.value,true,e.target.selectionStart)}});document.querySelector('.skip-link')?.addEventListener('click',e=>{e.preventDefault();$('#app').focus()});window.addEventListener('hashchange',navigate);
window.addEventListener('scroll',()=>{const sticky=$('#courseSticky'),hero=$('.ref-course-hero');if(sticky&&hero){const navigationHeight=document.querySelector('.header')?.getBoundingClientRect().height||64;sticky.classList.toggle('visible',hero.getBoundingClientRect().bottom<=navigationHeight)}},{passive:true});
document.addEventListener('click',e=>{const anchor=e.target.closest('a[href="#/course#prices"],a[href="#/mentorship#request"]');if(!anchor)return;if(location.hash===anchor.getAttribute('href')){e.preventDefault();document.getElementById(anchor.hash.split('#').pop())?.scrollIntoView({behavior:'smooth'})}});
init();