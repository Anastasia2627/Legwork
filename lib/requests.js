import {cancelMentorshipRequest} from './mentorship-commerce.js';
/**
 * Self-service cancellation for requests that have not entered the payment flow.
 * Never revoke purchased access or dismiss a provider-side payment that might settle.
 */
export function registerRequestRoutes(app, db, {auth}){
 const safeId=v=>/^[1-9]\d{0,10}$/.test(String(v))&&Number.isSafeInteger(Number(v));
 const blockedPayment=db.prepare("SELECT 1 FROM payment_attempt_orders pao JOIN payment_attempts pa ON pa.id=pao.attempt_id WHERE pao.order_id=? AND pa.status IN ('pending','approved','review_required') LIMIT 1");
 app.post('/api/orders/:id/cancel',auth,(req,res)=>{
  if(!safeId(req.params.id))return res.status(400).json({error:'Invalid order ID'});
  const id=Number(req.params.id);
  const row=db.prepare('SELECT id,status,kind FROM orders WHERE id=? AND user_id=?').get(id,req.user.id);
  if(!row)return res.status(404).json({error:'Order not found'});
  if(row.kind==='mentorship')return res.status(409).json({error:'Cancel mentorship orders through the mentorship request, not the generic order cancellation endpoint'});
  if(row.status!=='pending')return res.status(409).json({error:'Only unpaid pending orders can be cancelled'});
  try{
   const changed=db.transaction(()=>{
    if(blockedPayment.get(id))throw Error('Payment already initiated. Contact support to reconcile before cancelling.');
    return db.prepare("UPDATE orders SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'").run(id,req.user.id).changes;
   })();
   if(!changed)return res.status(409).json({error:'Order is no longer pending'});
   res.json({ok:true,status:'cancelled',message:'Pending order cancelled. No access was granted.'});
  }catch(err){res.status(409).json({error:err.message})}
 });
 app.post('/api/mentorships/:id/cancel',auth,(req,res)=>{
  const result=cancelMentorshipRequest(db,req.user.id,req.params.id);
  res.status(result.status).json(result.ok?{ok:true,status:'cancelled',message:result.message}:{error:result.error});
 });
}
