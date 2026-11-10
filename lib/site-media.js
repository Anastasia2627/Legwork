/**
 * Site media registry: approved public images and short promo videos.
 *
 * Every slot has a fixed purpose. Customer/private class videos do not belong here.
 * Staff edit URLs, descriptions and credits without changing client source code.
 * This does NOT upload binary files or verify third-party media licenses.
 */
const slots=[
 ['home_hero_video','Home · hero dance video','video'],
 ['home_hero_poster','Home · video poster','image'],
 ...Array.from({length:5},(_,i)=>['home_timeline_'+(i+1),'Home · story image '+(i+1),'image']),
 ...Array.from({length:5},(_,i)=>['home_workshop_'+(i+1),'Home · masterclass '+(i+1),'image']),
 ...Array.from({length:6},(_,i)=>['home_review_'+(i+1),'Home · approved student review '+(i+1),'image']),
 ['course_hero','Course · header photo','image'],
 ['course_preview','Course · free preview cover','image'],
 ['mentorship_portrait','Mentorship · mentor portrait','image'],
 ['mentorship_example','Mentorship · example thumbnail','image'],
 ['shop_bundle','Shop · generic bundle thumbnail','image'],
 ['account_course','Account · course thumbnail','image']
].map(([key,label,type])=>({key,label,type}));
const slotMap=new Map(slots.map(s=>[s.key,s]));
const safeValue=(v,max=1000)=>typeof v==='string'?v.trim().slice(0,max):'';
export function registerSiteMediaRoutes(app,db,{auth,admin,safeExternalUrl}){
 db.exec("CREATE TABLE IF NOT EXISTS site_media(slot TEXT PRIMARY KEY,url TEXT NOT NULL,alt TEXT NOT NULL DEFAULT '',credit TEXT NOT NULL DEFAULT '',source_url TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
 const get=db.prepare('SELECT slot,url,alt,credit,source_url,updated_at FROM site_media WHERE slot=?');
 const list=db.prepare('SELECT slot,url,alt,credit,source_url,updated_at FROM site_media ORDER BY slot');
 app.get('/api/media',(req,res)=>{
  const assets={};
  for(const record of list.all()){
   if(slotMap.has(record.slot)&&record.url){
    assets[record.slot]={url:record.url,alt:record.alt,credit:record.credit,source_url:record.source_url,type:slotMap.get(record.slot).type};
   }
  }
  res.setHeader('Cache-Control','no-store');
  res.json({assets});
 });
 app.get('/api/admin/media',auth,admin,(req,res)=>{
  const rows=new Map(list.all().map(row=>[row.slot,row]));
  res.setHeader('Cache-Control','private, no-store');
  res.json({slots:slots.map(slot=>({...slot,...(rows.get(slot.key)||{url:'',alt:'',credit:'',source_url:'',updated_at:null})}))});
 });
 app.patch('/api/admin/media/:slot',auth,admin,(req,res)=>{
  const slot=slotMap.get(req.params.slot);
  if(!slot)return res.status(404).json({error:'Unknown media slot'});
  const url=safeValue(req.body?.url,1100),alt=safeValue(req.body?.alt,160),credit=safeValue(req.body?.credit,150),sourceUrl=safeValue(req.body?.source_url,1100);
  if(url&&(!safeExternalUrl(url)||url.length>1000))return res.status(400).json({error:'Media URL must be a valid public HTTPS link'});
  if(sourceUrl&&(!safeExternalUrl(sourceUrl)||sourceUrl.length>1000))return res.status(400).json({error:'Credit/source URL must be a valid public HTTPS link'});
  if(url&&slot.type==='image'&&!alt)return res.status(400).json({error:'Add alternative text for this image'});
  if(!url&&(alt||credit||sourceUrl))return res.status(400).json({error:'Clear the other fields when removing an asset'});
  db.prepare("INSERT INTO site_media(slot,url,alt,credit,source_url,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(slot) DO UPDATE SET url=excluded.url,alt=excluded.alt,credit=excluded.credit,source_url=excluded.source_url,updated_at=CURRENT_TIMESTAMP").run(slot.key,url,alt,credit,sourceUrl);
  res.json({ok:true,slot:slot.key,asset:url?{url,alt,credit,source_url:sourceUrl,type:slot.type}:null});
 });
}
