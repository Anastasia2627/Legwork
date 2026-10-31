/**
 * Configurable lesson bundles. A bundle grants its purchased lessons,
 * never arbitrary course-level access. The API publishes no private video URLs.
 */
export function registerBundleRoutes(app,db,{auth,admin,cleanText,mail}){
 db.exec([
 'CREATE TABLE IF NOT EXISTS bundles(id INTEGER PRIMARY KEY,slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT "",direction TEXT NOT NULL DEFAULT "Legwork",price INTEGER NOT NULL,original_price INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1)',
 'CREATE TABLE IF NOT EXISTS bundle_lessons(bundle_id INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,PRIMARY KEY(bundle_id,lesson_id))'
 ].join(';')+';');
 const items=db.prepare('SELECT lesson_id FROM bundle_lessons WHERE bundle_id=? ORDER BY lesson_id');
 const inventory=db.prepare('SELECT id,slug,title,description,direction,price,original_price,active FROM bundles ORDER BY id DESC');
 const formatBundle=b=>({...b,lesson_ids:items.all(b.id).map(x=>x.lesson_id)});
 const isInt=x=>Number.isSafeInteger(x)&&x>0;
 const validAmount=x=>Number.isSafeInteger(x)&&x>=0&&x<=100000000;
 const bundleExists=db.prepare('SELECT * FROM bundles WHERE id=?');
 const ownedCount=db.prepare('SELECT COUNT(*) n FROM bundle_lessons bl JOIN lessons l ON l.id=bl.lesson_id WHERE bl.bundle_id=? AND NOT EXISTS (SELECT 1 FROM lesson_access la WHERE la.user_id=? AND la.lesson_id=l.id) AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id=? AND e.course_id=l.course_id)');
 const isFullyOwned=(id,userId)=>ownedCount.get(id,userId,userId).n===0;
 app.get('/api/bundles',(req,res)=>{
  const data=inventory.all().filter(b=>b.active===1).map(formatBundle);
  res.json({bundles:data});
 });
 app.get('/api/admin/bundles',auth,admin,(req,res)=>res.json({bundles:inventory.all().map(formatBundle)}));
 function validate(input,existing){
  const title=cleanText(input.title??existing?.title,140),slug=cleanText(input.slug??existing?.slug,90).toLowerCase(),description=cleanText(input.description??existing?.description,1600),direction=cleanText(input.direction??existing?.direction,60);
  const price=Number(input.price??existing?.price),original=Number(input.original_price??existing?.original_price);
  const lesson_ids=input.lesson_ids??existing?.lesson_ids;
  if(!title||!/^[a-z0-9-]{3,90}$/.test(slug)||!direction||!validAmount(price)||!validAmount(original)||price>original||!Array.isArray(lesson_ids)||lesson_ids.length<2||lesson_ids.length>30||lesson_ids.some(x=>!isInt(x))||new Set(lesson_ids).size!==lesson_ids.length)throw Error('Bundle requires a title, slug, valid prices and 2–30 distinct lessons');
  for(const id of lesson_ids)if(!db.prepare('SELECT 1 FROM lessons WHERE id=?').get(id))throw Error('A selected lesson does not exist');
  return {title,slug,description,direction,price,original,lesson_ids};
 }
 app.post('/api/admin/bundles',auth,admin,(req,res)=>{
  let v;try{v=validate(req.body)}catch(e){return res.status(400).json({error:e.message})}
  try{
   const id=db.transaction(()=>{
    const result=db.prepare('INSERT INTO bundles(slug,title,description,direction,price,original_price) VALUES(?,?,?,?,?,?)').run(v.slug,v.title,v.description,v.direction,v.price,v.original);
    const id=Number(result.lastInsertRowid);
    for(const lesson of v.lesson_ids)db.prepare('INSERT INTO bundle_lessons(bundle_id,lesson_id) VALUES(?,?)').run(id,lesson);
    return id;
   })();
   res.status(201).json({id});
  }catch{res.status(409).json({error:'Bundle slug already exists'})}
 });
 app.patch('/api/admin/bundles/:id',auth,admin,(req,res)=>{
  const b=bundleExists.get(req.params.id);if(!b)return res.status(404).json({error:'Bundle not found'});
  let v;try{v=validate(req.body,{...b,lesson_ids:items.all(b.id).map(x=>x.lesson_id)})}catch(e){return res.status(400).json({error:e.message})}
  const current=items.all(b.id).map(x=>x.lesson_id),changed=v.lesson_ids.length!==current.length||v.lesson_ids.some(x=>!current.includes(x));
  const sold=db.prepare("SELECT 1 FROM orders WHERE kind='bundle' AND item_id=? AND status='approved'").get(b.id);
  if(changed&&sold)return res.status(409).json({error:'Purchased bundle contents cannot be changed. Create a new bundle version.'});
  try{
   db.transaction(()=>{
    db.prepare('UPDATE bundles SET title=?,slug=?,description=?,direction=?,price=?,original_price=?,active=? WHERE id=?').run(v.title,v.slug,v.description,v.direction,v.price,v.original,req.body.active===undefined?b.active:(req.body.active===true?1:0),b.id);
    if(changed){db.prepare('DELETE FROM bundle_lessons WHERE bundle_id=?').run(b.id);for(const lesson of v.lesson_ids)db.prepare('INSERT INTO bundle_lessons(bundle_id,lesson_id) VALUES(?,?)').run(b.id,lesson)}
   })();
   res.json({ok:true});
  }catch{res.status(409).json({error:'Slug is already used'})}
 });
 app.post('/api/orders/bundle',auth,mail.requireVerified,(req,res)=>{
  const id=Number(req.body.bundle_id);
  if(!isInt(id))return res.status(400).json({error:'Invalid bundle'});
  const b=bundleExists.get(id);
  if(!b||!b.active)return res.status(404).json({error:'Bundle unavailable'});
  if(isFullyOwned(b.id,req.user.id))return res.status(409).json({error:'You already own all lessons in this bundle'});
  const pending=db.prepare("SELECT 1 FROM orders WHERE user_id=? AND kind='bundle' AND item_id=? AND status='pending'").get(req.user.id,b.id);
  if(pending)return res.status(409).json({error:'Bundle order already pending'});
  const result=db.prepare("INSERT INTO orders(user_id,kind,item_id,amount,plan) VALUES(?,'bundle',?,?,'self')").run(req.user.id,b.id,b.price);
  res.status(201).json({id:Number(result.lastInsertRowid),amount:b.price,status:'pending',message:'Bundle request saved; no payment was taken.'});
 });
}
