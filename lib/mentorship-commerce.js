/**
 * Owner-approved mentorship offers and immutable pricing snapshots.
 *
 * Prices and delivery commitments are NEVER invented in seed data. A package
 * must be explicitly published by the school before it can produce a
 * checkout-eligible pending order. Historical unquoted requests continue
 * through the established manual process.
 */
export function initMentorshipCommerce(db){
 db.exec([
  "CREATE TABLE IF NOT EXISTS mentorship_offers(package TEXT PRIMARY KEY CHECK(package IN ('Basic','Deep')),price_usd_cents INTEGER,turnaround_business_days INTEGER,published INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS mentorship_order_quotes(mentorship_id INTEGER PRIMARY KEY REFERENCES mentorships(id) ON DELETE RESTRICT,order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,turnaround_business_days INTEGER NOT NULL,quoted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
 ].join(';')+';');
 db.prepare("INSERT OR IGNORE INTO mentorship_offers(package,published) VALUES('Basic',0),('Deep',0)").run();
}
export const validMentorshipPackage=name=>name==='Basic'||name==='Deep';
const safeId=value=>/^[1-9]\d{0,10}$/.test(String(value))&&Number.isSafeInteger(Number(value));

export function publicMentorshipOffer(db,pack){
 const r=db.prepare('SELECT package,price_usd_cents,turnaround_business_days,published FROM mentorship_offers WHERE package=?').get(pack);
 return r&&r.published===1&&Number.isSafeInteger(r.price_usd_cents)&&r.price_usd_cents>=100&&
  Number.isSafeInteger(r.turnaround_business_days)&&r.turnaround_business_days>=1&&r.turnaround_business_days<=60
  ? {package:r.package,published:true,price_usd_cents:r.price_usd_cents,turnaround_business_days:r.turnaround_business_days}
  :{package:pack,published:false,price_usd_cents:null,turnaround_business_days:null};
}
export function createMentorshipWithQuote(db,userId,details){
 return db.transaction(()=>{
  const created=db.prepare('INSERT INTO mentorships(user_id,package,video_url,experience,goals,instagram,training_frequency,teaching) VALUES(?,?,?,?,?,?,?,?)')
   .run(userId,details.package,details.url,details.experience,details.goals,details.instagram,details.training_frequency,details.teaching);
  const id=Number(created.lastInsertRowid);
  const offer=publicMentorshipOffer(db,details.package);
  if(!offer.published)return {id,order_id:null,quote:null};
  const order=db.prepare("INSERT INTO orders(user_id,kind,item_id,amount,plan) VALUES(?,'mentorship',?,?,'self')")
   .run(userId,id,offer.price_usd_cents);
  const orderId=Number(order.lastInsertRowid);
  db.prepare('INSERT INTO mentorship_order_quotes(mentorship_id,order_id,turnaround_business_days) VALUES(?,?,?)')
   .run(id,orderId,offer.turnaround_business_days);
  return {id,order_id:orderId,quote:{price_usd_cents:offer.price_usd_cents,
   turnaround_business_days:offer.turnaround_business_days}};
 })();
}
export function getMentorshipQuote(db,mentorshipId){
 return db.prepare('SELECT q.order_id,q.turnaround_business_days,o.amount AS price_usd_cents,o.status AS order_status FROM mentorship_order_quotes q JOIN orders o ON o.id=q.order_id WHERE q.mentorship_id=?').get(mentorshipId);
}
export function mentorshipOrderUnavailable(db,order){
 if(order.kind!=='mentorship')return true;
 const row=db.prepare('SELECT m.id,m.status,m.user_id,q.order_id FROM mentorships m JOIN mentorship_order_quotes q ON q.mentorship_id=m.id WHERE m.id=?')
  .get(order.item_id);
 return !row||row.status!=='awaiting_payment'||row.user_id!==order.user_id||row.order_id!==order.id;
}
/** Called ONLY from an Approved provider callback inside its transaction. */
export function grantMentorshipPayment(db,order){
 if(mentorshipOrderUnavailable(db,order))throw Error('Mentorship order no longer eligible');
 const changed=db.prepare("UPDATE mentorships SET status='paid' WHERE id=? AND user_id=? AND status='awaiting_payment'")
  .run(order.item_id,order.user_id).changes;
 if(changed!==1)throw Error('Mentorship payment requires reconciliation');
}
export function verifyMentorshipManualPayment(db,rawId){
 if(!safeId(rawId))return {status:400,error:'Invalid mentorship ID'};
 const id=Number(rawId);
 try{
  const result=db.transaction(()=>{
   const m=db.prepare('SELECT * FROM mentorships WHERE id=?').get(id);
   if(!m||m.status!=='awaiting_payment')return {status:409,error:'Mentorship request not awaiting payment'};
   const quote=getMentorshipQuote(db,id);
   if(quote){
    if(quote.order_status!=='pending')return {status:409,error:'Linked mentorship order is not pending'};
    const blocking=db.prepare("SELECT 1 FROM payment_attempt_orders pao JOIN payment_attempts pa ON pa.id=pao.attempt_id WHERE pao.order_id=? AND pa.status IN ('pending','approved','review_required') LIMIT 1").get(quote.order_id);
    if(blocking)return {status:409,error:'A provider payment is active or requires reconciliation. Do not mark this request paid manually'};
    const result=db.prepare("UPDATE orders SET status='approved' WHERE id=? AND status='pending'").run(quote.order_id);
    if(result.changes!==1)throw Error('Mentorship order changed during verification');
   }
   const changed=db.prepare("UPDATE mentorships SET status='paid' WHERE id=? AND status='awaiting_payment'").run(id);
   if(changed.changes!==1)throw Error('Mentorship changed during verification');
   return {status:200,ok:true};
  })();
  return result;
 }catch{return {status:409,error:'Mentorship payment requires reconciliation'}}
}
export function cancelMentorshipRequest(db,userId,rawId){
 if(!safeId(rawId))return {status:400,error:'Invalid mentorship ID'};
 const id=Number(rawId);
 try{
  return db.transaction(()=>{
   const m=db.prepare('SELECT id,status FROM mentorships WHERE id=? AND user_id=?').get(id,userId);
   if(!m)return {status:404,error:'Mentorship request not found'};
   if(m.status!=='awaiting_payment')return {status:409,error:'Only unpaid requests can be cancelled'};
   const quote=getMentorshipQuote(db,id);
   if(quote){
    const busy=db.prepare("SELECT 1 FROM payment_attempt_orders pao JOIN payment_attempts pa ON pa.id=pao.attempt_id WHERE pao.order_id=? AND pa.status IN ('pending','approved','review_required') LIMIT 1").get(quote.order_id);
    if(busy)return {status:409,error:'Payment already initiated. Contact support to reconcile before cancelling'};
    if(quote.order_status!=='pending')return {status:409,error:'Linked order is no longer pending'};
    db.prepare("UPDATE orders SET status='cancelled' WHERE id=? AND status='pending'").run(quote.order_id);
   }
   db.prepare("UPDATE mentorships SET status='cancelled' WHERE id=? AND user_id=? AND status='awaiting_payment'").run(id,userId);
   return {status:200,ok:true,message:'Unpaid mentorship request cancelled'};
  })();
 }catch{return {status:409,error:'Cancellation requires payment reconciliation'}}
}
export function registerMentorshipCommerceRoutes(app,db,{auth,admin}){
 const noStore=res=>res.setHeader('Cache-Control','private, no-store');
 app.get('/api/mentorship/offers',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.json({offers:['Basic','Deep'].map(pack=>publicMentorshipOffer(db,pack))});
 });
 app.get('/api/admin/mentorship/offers',auth,admin,(req,res)=>{
  noStore(res);
  res.json({offers:db.prepare('SELECT package,price_usd_cents,turnaround_business_days,published,updated_at FROM mentorship_offers ORDER BY package').all()});
 });
 app.patch('/api/admin/mentorship/offers/:package',auth,admin,(req,res)=>{
  noStore(res);
  const pack=req.params.package;
  if(!validMentorshipPackage(pack))return res.status(404).json({error:'Mentorship package not found'});
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.published!=='boolean')
   return res.status(400).json({error:'Explicit published status required'});
  const cents=body.price_usd_cents,days=body.turnaround_business_days;
  if((cents!==null&&(!Number.isSafeInteger(cents)||cents<100||cents>100000000))||
    (days!==null&&(!Number.isSafeInteger(days)||days<1||days>60)))
   return res.status(400).json({error:'Price must be 100–100000000 USD cents; response time 1–60 business days'});
  if(body.published&&(cents===null||days===null))
   return res.status(400).json({error:'Both approved price and business-day deadline are required to publish'});
  const changed=db.prepare("UPDATE mentorship_offers SET price_usd_cents=?,turnaround_business_days=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE package=?")
   .run(cents,days,body.published?1:0,pack).changes;
  if(!changed)return res.status(404).json({error:'Mentorship package not found'});
  return res.json({ok:true,offer:publicMentorshipOffer(db,pack)});
 });
}
