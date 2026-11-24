/**
 * Read-only operational snapshot. This is NOT a readiness/uptime guarantee.
 * Reports aggregate counts only, never secrets, email addresses or user data.
 */
export function registerOperationsRoutes(app,db,{auth,admin,mail}){
 const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
 const count=(table,query,args=[])=>exists.get(table)?Number(db.prepare(query).get(...args)?.n||0):0;
 app.get('/api/admin/operations/status',auth,admin,(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  const now=Date.now(),since=new Date(now-24*3600_000).toISOString().slice(0,19).replace('T',' ');
  const pendingMail=count('mail_outbox',"SELECT COUNT(*) n FROM mail_outbox WHERE status='pending'");
  const failedMail=count('mail_outbox',"SELECT COUNT(*) n FROM mail_outbox WHERE status='failed'");
  const rejectedMail=count('mail_outbox',"SELECT COUNT(*) n FROM mail_outbox WHERE delivery_status IN ('bounced','complained','suppressed','failed')");
  const delayedMail=count('mail_outbox',"SELECT COUNT(*) n FROM mail_outbox WHERE delivery_status='delayed'");
  const openPayments=count('payment_attempts',"SELECT COUNT(*) n FROM payment_attempts WHERE status='review_required'");
  const stalePayments=count('payment_attempts',"SELECT COUNT(*) n FROM payment_attempts WHERE status='pending' AND created_at<?",[since]);
  const flaggedAudit=count('security_audit',"SELECT COUNT(*) n FROM security_audit WHERE outcome IN ('denied','failed') AND occurred_at>?",[now-24*3600_000]);
  const deletionPending=count('account_deletion_requests',"SELECT COUNT(*) n FROM account_deletion_requests WHERE status IN ('pending','in_review')");
  const imageBytes=count('uploaded_images',"SELECT COALESCE(SUM(bytes),0) n FROM uploaded_images");
  const checkpointCount=count('recovery_checkpoints',"SELECT COUNT(*) n FROM recovery_checkpoints");
  const checks={
   mail_configured:!!mail?.enabled,
   mail_pending:pendingMail,
   mail_failed:failedMail,
   mail_rejected_by_provider:rejectedMail,
   mail_delivery_delayed:delayedMail,
   payment_provider_requested:process.env.PAYMENT_PROVIDER==='wayforpay',
   payments_require_review:openPayments,
   payments_stale:stalePayments,
   security_denied_or_failed_24h:flaggedAudit,
   privacy_requests_open:deletionPending,
   stored_public_image_bytes:imageBytes,
   cloudflare_recovery_checkpoints:checkpointCount,
   independent_backup_verified:false
  };
  const alerts=[];
  if(failedMail>0)alerts.push({code:'mail_failed',level:'warning',count:failedMail});
  if(rejectedMail>0)alerts.push({code:'provider_email_rejected',level:'warning',count:rejectedMail});
  if(delayedMail>0)alerts.push({code:'provider_email_delayed',level:'notice',count:delayedMail});
  if(openPayments>0)alerts.push({code:'payment_review',level:'critical',count:openPayments});
  if(stalePayments>0)alerts.push({code:'payment_stale',level:'warning',count:stalePayments});
  if(deletionPending>0)alerts.push({code:'deletion_requests',level:'notice',count:deletionPending});
  // Do not conflate a configured Resend provider with proven delivery.
  res.json({checked_at:new Date(now).toISOString(),
   environment:process.env.DEPLOYMENT_STAGE||'node',
   checks,alerts,
   notes:['Configuration and aggregate counts are not external provider verification.',
    'Independent offsite backups and production incident alert delivery are not yet verified.']});
 });
}
