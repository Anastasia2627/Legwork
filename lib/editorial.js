/**
 * Small, schema-bound editorial CMS.
 * Only a fixed set of plain-text fields can be changed by a signed-in admin.
 * No HTML, scripts, dynamic page templates, arbitrary keys or file paths.
 */
export const EDITORIAL_DEFAULTS={
 home:{
  en:{eyebrow:'SVITLANA YURCHAK · DANCE EDUCATION',headlineTop:'MOVE LIKE',headlineAccent:'A BOSS.',intro:'Learn exotic pole dance with confidence, intention, and movement that feels unmistakably yours.',cta:'EXPLORE COURSES',metaTitle:'Svitlana Yurchak | Dance Education',metaDescription:'Svitlana Yurchak — online exotic pole dance courses, Legwork Lab, classes and personal mentorship.'},
  es:{eyebrow:'SVITLANA YURCHAK · EDUCACIÓN EN DANZA',headlineTop:'MUÉVETE COMO',headlineAccent:'UNA JEFA.',intro:'Aprende exotic pole dance con confianza, técnica y estilo propio.',cta:'EXPLORAR CURSOS',metaTitle:'Svitlana Yurchak | Escuela de danza',metaDescription:'Cursos online de exotic pole dance, Legwork Lab, clases y mentoría personal con Svitlana Yurchak.'}
 },
 course:{
  en:{eyebrow:'SIGNATURE ONLINE COURSE · LEGWORK LAB',headline:'IMPROVE YOUR LEGWORK WITHOUT EXHAUSTING STRETCHING.',intro:'Learn from Svitlana Yurchak, creator of the Flexi Legs technique. Even if you just started dancing.',cta:"I'M READY",metaTitle:'Legwork Lab | Svitlana Yurchak',metaDescription:'Explore Legwork Lab, online dance technique training with Svitlana Yurchak. Review lessons, course options and requirements.'},
  es:{eyebrow:'CURSO ONLINE · LEGWORK LAB',headline:'MEJORA TU LEGWORK SIN ESTIRAMIENTOS AGOTADORES.',intro:'Aprende con Svitlana Yurchak, creadora de la técnica Flexi Legs, incluso si acabas de empezar a bailar.',cta:'QUIERO EMPEZAR',metaTitle:'Legwork Lab | Svitlana Yurchak',metaDescription:'Descubre Legwork Lab, entrenamiento de técnica de baile online con Svitlana Yurchak. Clases, opciones y requisitos.'}
 },
 mentorship:{
  en:{eyebrow:'PERSONAL FEEDBACK · MENTORSHIP',headline:'GET MENTOR-LEVEL FEEDBACK ON YOUR VIDEO.',intro:'Detailed, supportive guidance from artist and coach Svitlana Yurchak.',cta:'GET MENTORSHIP',metaTitle:'Mentorship | Svitlana Yurchak',metaDescription:'Request personal dance video feedback from Svitlana Yurchak. Learn about Basic and Deep mentorship.'},
  es:{eyebrow:'ASESORÍA PERSONAL · MENTORÍA',headline:'RECIBE COMENTARIOS PROFESIONALES SOBRE TU VÍDEO.',intro:'Consejos detallados y personalizados de la artista y entrenadora Svitlana Yurchak.',cta:'SOLICITAR MENTORÍA',metaTitle:'Mentoría | Svitlana Yurchak',metaDescription:'Solicita comentarios personales sobre tu vídeo de baile con Svitlana Yurchak. Conoce la mentoría Basic y Deep.'}
 }
};
const locales=['en','es'];
const pageNames=Object.keys(EDITORIAL_DEFAULTS);
const allowed=(page,lang)=>pageNames.includes(page)&&locales.includes(lang);
const escapeText=s=>String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim();
const bounds={eyebrow:90,headlineTop:70,headlineAccent:70,headline:160,intro:380,cta:64,metaTitle:100,metaDescription:170};
const merge=(rows)=>{
 const content=structuredClone(EDITORIAL_DEFAULTS),revisions={};
 for(const page of pageNames)for(const lang of locales)revisions[page+':'+lang]=0;
 for(const row of rows){
  if(!allowed(row.page,row.lang))continue;
  try{
   const overrides=JSON.parse(row.content_json);
   if(!overrides||Array.isArray(overrides)||typeof overrides!=='object')continue;
   for(const field of Object.keys(content[row.page][row.lang])){
    if(typeof overrides[field]==='string'&&overrides[field].length<=bounds[field])content[row.page][row.lang][field]=overrides[field];
   }
   revisions[row.page+':'+row.lang]=row.revision;
  }catch{ /* Ignore invalid historical records instead of interpreting HTML. */ }
 }
 return {content,revisions};
};

export function registerEditorialRoutes(app,db,{auth,admin}){
 db.exec("CREATE TABLE IF NOT EXISTS editorial_content(page TEXT NOT NULL,lang TEXT NOT NULL,content_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(page,lang),CHECK(page IN ('home','course','mentorship')),CHECK(lang IN ('en','es')))");
 const select=db.prepare('SELECT page,lang,content_json,revision FROM editorial_content');
 const get=db.prepare('SELECT content_json,revision FROM editorial_content WHERE page=? AND lang=?');
 const serialize=()=>merge(select.all());
 app.get('/api/content',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.json({pages:serialize().content});
 });
 app.get('/api/admin/content',auth,admin,(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.json({...serialize(),pages:pageNames,locales});
 });
 app.put('/api/admin/content/:page/:lang',auth,admin,(req,res)=>{
  const page=req.params.page,lang=req.params.lang;
  if(!allowed(page,lang))return res.status(404).json({error:'Unknown editorial page or language'});
  const values=req.body?.values,expected=req.body?.expected_revision;
  if(!values||typeof values!=='object'||Array.isArray(values)||!Number.isSafeInteger(expected)||expected<0)return res.status(400).json({error:'Invalid content update'});
  const fields=Object.keys(EDITORIAL_DEFAULTS[page][lang]);
  if(Object.keys(values).length!==fields.length||Object.keys(values).some(k=>!fields.includes(k)))return res.status(400).json({error:'Unexpected or missing content fields'});
  const normalized={};
  for(const key of fields){
   if(typeof values[key]!=='string')return res.status(400).json({error:'All fields must contain plain text'});
   const value=escapeText(values[key]);
   if(value.length<1||value.length>bounds[key])return res.status(400).json({error:key+' must have 1–'+bounds[key]+' characters'});
   normalized[key]=value;
  }
  let revision;
  try{
   revision=db.transaction(()=>{
    const existing=get.get(page,lang),before=existing?.revision||0;
    if(before!==expected)return null;
    if(existing)db.prepare('UPDATE editorial_content SET content_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE page=? AND lang=? AND revision=?').run(JSON.stringify(normalized),req.user.id,page,lang,expected);
    else db.prepare('INSERT INTO editorial_content(page,lang,content_json,revision,updated_by) VALUES(?,?,?,1,?)').run(page,lang,JSON.stringify(normalized),req.user.id);
    return before+1;
   })();
  }catch{return res.status(500).json({error:'Unable to save editorial text'})}
  if(revision===null)return res.status(409).json({error:'This page has been changed elsewhere. Reload the editor to avoid overwriting it.'});
  res.json({ok:true,page,lang,revision,values:normalized});
 });
}
