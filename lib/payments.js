import crypto from 'node:crypto';

const PAY_URL='https://secure.wayforpay.com/pay';
const callbackFields=['merchantAccount','orderReference','amount','currency','authCode','cardPan','transactionStatus','reasonCode'];
const sign=(parts,secret)=>crypto.createHmac('md5',secret).update(parts.map(value=>String(value??'')).join(';'),'utf8').digest('hex');
const equalHex=(left,right)=>{if(!/^[a-f0-9]{32}$/i.test(String(right||'')))return false;const a=Buffer.from(left,'hex'),b=Buffer.from(right,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const moneyFromMinor=n=>(n/100).toFixed(2);
const positiveId=n=>Number.isSafeInteger(n)&&n>0;
const readRate=text=>{if(!/^(?:[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(String(text||'')))return null;const [whole,part='']=String(text).split('.');return Number(whole)*100+Number(part.padEnd(2,'0'))};
const roundKop=(usdCents,rate)=>Number((BigInt(usdCents)*BigInt(rate)+50n)/100n);
const parseMinor=value=>{const s=String(value??'');if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(s))return null;const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));return Number.isSafeInteger(n)?n:null};
function configuration(){
 const site=process.env.SITE_ORIGIN||'',merchant=process.env.WAYFORPAY_MERCHANT_ACCOUNT||'',secret=process.env.WAYFORPAY_SECRET_KEY||'',rate=readRate(process.env.WAYFORPAY_UAH_PER_USD);
 let origin;try{origin=new URL(site)}catch{return {enabled:false,reason:'SITE_ORIGIN missing or invalid'}}
 const secure=origin.protocol==='https:'||(process.env.NODE_ENV==='test'&&origin.protocol==='http:');
 if(process.env.PAYMENT_PROVIDER!=='wayforpay'||!merchant||secret.length<12||!rate||!secure)return {enabled:false,reason:'WayForPay credentials, public HTTPS origin, or explicit UAH conversion rate are missing'};
 return {enabled:true,site:origin.origin,domain:process.env.WAYFORPAY_DOMAIN||origin.hostname,merchant,secret,rate};
}
export function initPayments(db){
 db.exec([
  "CREATE TABLE IF NOT EXISTS payment_attempts(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),provider TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,usd_cents INTEGER NOT NULL,uah_kopecks INTEGER NOT NULL,rate_x100 INTEGER NOT NULL,currency TEXT NOT NULL DEFAULT 'UAH',status TEXT NOT NULL DEFAULT 'pending',order_epoch INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  'CREATE TABLE IF NOT EXISTS payment_attempt_orders(attempt_id INTEGER NOT NULL REFERENCES payment_attempts(id),order_id INTEGER NOT NULL REFERENCES orders(id),amount_usd_cents INTEGER NOT NULL,PRIMARY KEY(attempt_id,order_id))',
  'CREATE TABLE IF NOT EXISTS payment_events(id INTEGER PRIMARY KEY,attempt_id INTEGER NOT NULL REFERENCES payment_attempts(id),event_hash TEXT NOT NULL UNIQUE,status TEXT NOT NULL,received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
 ].join(';')+';');
 if(!db.pragma('table_info(payment_attempts)').some(column=>column.name==='order_epoch'))db.exec('ALTER TABLE payment_attempts ADD COLUMN order_epoch INTEGER NOT NULL DEFAULT 0');
}
function grant(db,order){
 if(order.kind==='course'){
  db.prepare("INSERT INTO enrollments(user_id,course_id,tier) VALUES(?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET tier=CASE WHEN excluded.tier='guru' THEN 'guru' ELSE enrollments.tier END").run(order.user_id,order.item_id,order.plan==='guru'?'guru':'self');
 }else if(order.kind==='lesson'){
  db.prepare('INSERT OR IGNORE INTO lesson_access(user_id,lesson_id) VALUES(?,?)').run(order.user_id,order.item_id);
 }else if(order.kind==='bundle'){
  const contents=db.prepare('SELECT lesson_id FROM bundle_lessons WHERE bundle_id=?').all(order.item_id);
  if(contents.length<2)throw Error('Bundle contents missing');
  const add=db.prepare('INSERT OR IGNORE INTO lesson_access(user_id,lesson_id) VALUES(?,?)');
  for(const item of contents)add.run(order.user_id,item.lesson_id);
 }else throw Error('Unknown order type');
}
export function registerPaymentWebhook(app,db,getMail=()=>null){
 app.post('/api/payments/wayforpay/webhook',(req,res)=>{
  const cfg=configuration();
  if(!cfg.enabled)return res.status(503).json({error:'Payment provider disabled'});
  const payload=req.body;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return res.status(400).json({error:'Invalid callback'});
  if(payload.merchantAccount!==cfg.merchant||typeof payload.orderReference!=='string'||!/^LGW-[a-f0-9-]{16,60}$/.test(payload.orderReference))return res.status(403).json({error:'Unknown merchant or reference'});
  const actualSignature=sign(callbackFields.map(key=>payload[key]),cfg.secret);
  if(!equalHex(actualSignature,payload.merchantSignature))return res.status(403).json({error:'Invalid callback signature'});
  const attempt=db.prepare('SELECT * FROM payment_attempts WHERE reference=? AND provider=?').get(payload.orderReference,'wayforpay');
  if(!attempt)return res.status(404).json({error:'Payment attempt not found'});
  const amount=parseMinor(payload.amount);
  if(amount!==attempt.uah_kopecks||payload.currency!=='UAH')return res.status(409).json({error:'Payment amount or currency mismatch'});
  const status=String(payload.transactionStatus||'');
  if(!['Approved','Declined','Expired','Refunded','Voided','RefundInProcessing','Pending'].includes(status))return res.status(400).json({error:'Unexpected payment status'});
  const eventHash=crypto.createHash('sha256').update(attempt.reference+';'+status+';'+actualSignature).digest('hex');
  try{
   db.transaction(()=>{
    db.prepare('INSERT OR IGNORE INTO payment_events(attempt_id,event_hash,status) VALUES(?,?,?)').run(attempt.id,eventHash,status);
    const now=db.prepare('SELECT status FROM payment_attempts WHERE id=?').get(attempt.id).status;
    if(now==='approved'){
     if(['Refunded','Voided','RefundInProcessing'].includes(status))db.prepare("UPDATE payment_attempts SET status='review_required',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(attempt.id);
     return;
    }
    if(now==='review_required')return;
    if(status==='Approved'){
     const orderRows=db.prepare('SELECT o.*,po.amount_usd_cents AS snapshot_amount FROM payment_attempt_orders po JOIN orders o ON o.id=po.order_id WHERE po.attempt_id=?').all(attempt.id);
     if(!orderRows.length||orderRows.reduce((sum,o)=>sum+o.snapshot_amount,0)!==attempt.usd_cents)throw Error('Order snapshot mismatch');
     for(const order of orderRows){
      if(!['pending','approved'].includes(order.status))throw Error('Order no longer eligible');
      grant(db,order);
      db.prepare("UPDATE orders SET status='approved' WHERE id=? AND status='pending'").run(order.id);
     }
     db.prepare("UPDATE payment_attempts SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(attempt.id);
    }else if(['Declined','Expired'].includes(status)){
     db.prepare("UPDATE payment_attempts SET status='declined',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(attempt.id);
    }else if(['Refunded','Voided','RefundInProcessing'].includes(status)){
     db.prepare("UPDATE payment_attempts SET status='review_required',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(attempt.id);
    }
   })();
  }catch(error){console.error('Payment callback failed:',error.message);return res.status(409).json({error:'Payment reconciliation required'})}
  if(status==='Approved'){
   const mail=getMail();
   const buyer=db.prepare('SELECT email FROM users WHERE id=?').get(attempt.user_id);
   if(mail&&buyer){
    const orders=db.prepare('SELECT order_id FROM payment_attempt_orders WHERE attempt_id=?').all(attempt.id);
    for(const o of orders)mail.notify(buyer.email,'order:approved:'+o.order_id,'Legwork · Your course access is ready','Payment confirmed for order #'+o.order_id+'. Your courses and classes are available in your Legwork account.');
   }
  }
  const time=Math.floor(Date.now()/1000);
  res.json({orderReference:attempt.reference,status:'accept',time,signature:sign([attempt.reference,'accept',time],cfg.secret)});
 });
}
function paymentForm(attempt,cfg,email,lang){
 const orderDate=attempt.order_epoch||Math.floor(Date.parse(attempt.created_at.replace(' ','T')+'Z')/1000);
 const amount=moneyFromMinor(attempt.uah_kopecks);
 const productName=['Legwork courses and classes — '+attempt.reference],productCount=['1'],productPrice=[amount];
 const signature=sign([cfg.merchant,cfg.domain,attempt.reference,orderDate,amount,'UAH',...productName,...productCount,...productPrice],cfg.secret);
 return {
  attempt_id:attempt.id,provider:'WayForPay',url:PAY_URL,
  fields:{
   merchantAccount:cfg.merchant,merchantDomainName:cfg.domain,merchantSignature:signature,merchantAuthType:'SimpleSignature',
   orderReference:attempt.reference,orderDate:String(orderDate),amount,currency:'UAH',apiVersion:'1',orderTimeout:'86400',
   merchantTransactionType:'SALE',merchantTransactionSecureType:'AUTO',language:lang==='es'?'ES':'EN',
   returnUrl:cfg.site+'/#/payment/'+attempt.id,serviceUrl:cfg.site+'/api/payments/wayforpay/webhook',
   'productName[]':productName,'productCount[]':productCount,'productPrice[]':productPrice,clientEmail:email
  },
  price:{usd_cents:attempt.usd_cents,uah_kopecks:attempt.uah_kopecks,currency:'UAH',rate_uah_per_usd:(attempt.rate_x100/100).toFixed(2)},
  message:'Payment is pending. Access is granted only after a signed provider callback.'
 };
}
export function registerPaymentRoutes(app,db,{auth,admin,mail}){
 app.get('/api/payments/config',(req,res)=>{
  const cfg=configuration();
  res.json({enabled:cfg.enabled,provider:cfg.enabled?'WayForPay':null,currency:'UAH',rate_uah_per_usd:cfg.enabled?(cfg.rate/100).toFixed(2):null,note:cfg.enabled?'Prices are shown in USD; checkout uses the fixed store conversion rate shown here.':'Online payments are not configured; pending requests require manual verification.'});
 });
 app.post('/api/payments/checkout',auth,mail.requireVerified,(req,res)=>{
  const cfg=configuration();if(!cfg.enabled)return res.status(503).json({error:'Online payments are not configured'});
  const ids=req.body?.order_ids;
  if(!Array.isArray(ids)||ids.length<1||ids.length>30||ids.some(id=>!positiveId(id))||new Set(ids).size!==ids.length)return res.status(400).json({error:'Choose 1–30 distinct pending orders'});
  const getOrder=db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?');
  const busy=db.prepare("SELECT pa.id FROM payment_attempt_orders ao JOIN payment_attempts pa ON pa.id=ao.attempt_id WHERE ao.order_id=? AND pa.status='pending' LIMIT 1");
  const orders=ids.map(id=>getOrder.get(id,req.user.id));
  if(orders.some(o=>!o||o.status!=='pending'||!Number.isSafeInteger(o.amount)||o.amount<1||busy.get(o.id)))return res.status(409).json({error:'Orders must belong to you and must not already be paid or awaiting payment'});
  const total=orders.reduce((s,o)=>s+o.amount,0);if(!Number.isSafeInteger(total))return res.status(400).json({error:'Total is too large'});
  const kop=roundKop(total,cfg.rate);if(!Number.isSafeInteger(kop)||kop<100||kop>1000000000)return res.status(400).json({error:'Converted amount out of range'});
  let attempt;
  const orderEpoch=Math.floor(Date.now()/1000);
  try{
   attempt=db.transaction(()=>{
    for(const o of orders)if(busy.get(o.id))throw Error('Already awaiting payment');
    const reference='LGW-'+crypto.randomUUID();
    const row=db.prepare('INSERT INTO payment_attempts(user_id,provider,reference,usd_cents,uah_kopecks,rate_x100,order_epoch) VALUES(?,?,?,?,?,?,?)').run(req.user.id,'wayforpay',reference,total,kop,cfg.rate,orderEpoch);
    const attemptId=Number(row.lastInsertRowid);
    const add=db.prepare('INSERT INTO payment_attempt_orders(attempt_id,order_id,amount_usd_cents) VALUES(?,?,?)');
    for(const o of orders)add.run(attemptId,o.id,o.amount);
    return {id:attemptId,reference,usd_cents:total,uah_kopecks:kop,rate_x100:cfg.rate,order_epoch:orderEpoch};
   })();
  }catch{return res.status(409).json({error:'A payment is already being processed for these orders'})}
  res.setHeader('Cache-Control','no-store');
  res.status(201).json(paymentForm(attempt,cfg,req.user.email,req.body?.language));
 });
 app.get('/api/payments/mine',auth,(req,res)=>{
  const rows=db.prepare('SELECT id,reference,usd_cents,uah_kopecks,status,order_epoch,created_at FROM payment_attempts WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id);
  res.setHeader('Cache-Control','private, no-store');res.json({payments:rows});
 });
 app.post('/api/payments/continue',auth,mail.requireVerified,(req,res)=>{
  const cfg=configuration();if(!cfg.enabled)return res.status(503).json({error:'Online payments are not configured'});
  const id=Number(req.body?.attempt_id);if(!positiveId(id))return res.status(400).json({error:'Invalid payment'});
  const attempt=db.prepare('SELECT * FROM payment_attempts WHERE id=? AND user_id=? AND provider=?').get(id,req.user.id,'wayforpay');
  if(!attempt)return res.status(404).json({error:'Payment not found'});
  if(attempt.status!=='pending')return res.status(409).json({error:'This payment is no longer awaiting confirmation'});
  if(!attempt.order_epoch||Math.floor(Date.now()/1000)-attempt.order_epoch>=86400)return res.status(409).json({error:'This payment page has expired. Contact support to reconcile the original transaction.'});
  res.setHeader('Cache-Control','no-store');res.json(paymentForm(attempt,cfg,req.user.email,req.body?.language));
 });
 app.get('/api/payments/status/:id',auth,(req,res)=>{
  const attempt=db.prepare('SELECT id,user_id,reference,provider,usd_cents,uah_kopecks,status,created_at,updated_at FROM payment_attempts WHERE id=?').get(req.params.id);
  if(!attempt)return res.status(404).json({error:'Payment not found'});
  if(attempt.user_id!==req.user.id&&req.user.role!=='admin')return res.status(403).json({error:'Forbidden'});
  res.setHeader('Cache-Control','private, no-store');res.json({payment:{id:attempt.id,reference:attempt.reference,provider:attempt.provider,usd_cents:attempt.usd_cents,uah_kopecks:attempt.uah_kopecks,currency:'UAH',status:attempt.status,created_at:attempt.created_at,updated_at:attempt.updated_at}});
 });
 app.get('/api/admin/payments',auth,admin,(req,res)=>{
  const rows=db.prepare('SELECT p.id,p.reference,p.user_id,u.email,p.usd_cents,p.uah_kopecks,p.status,p.created_at,p.updated_at FROM payment_attempts p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 100').all();
  res.json({payments:rows});
 });
}
