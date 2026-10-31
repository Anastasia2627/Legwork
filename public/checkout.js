/**
 * Browser-side handoff to WayForPay. This module never sees the merchant secret.
 * User return is informative; ONLY the signed webhook grants purchased content.
 */
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export async function beginCheckout(orderIds,{api}){
 const result=await api('/payments/checkout','POST',{order_ids:orderIds,language:document.documentElement.lang});
 return submitHostedPayment(result);
}
export async function resumeCheckout(attemptId,{api}){
 const result=await api('/payments/continue','POST',{attempt_id:attemptId,language:document.documentElement.lang});
 return submitHostedPayment(result);
}
function submitHostedPayment(result){
 if(result.url!=='https://secure.wayforpay.com/pay'||!result.fields||result.provider!=='WayForPay')throw Error('Payment gateway response is invalid');
 const amount=(result.price.uah_kopecks/100).toFixed(2);
 const rate=result.price.rate_uah_per_usd;
 if(!window.confirm(document.documentElement.lang==='es'?'Pago seguro con WayForPay: '+amount+' UAH al tipo de cambio de la tienda '+rate+' UAH por USD. ¿Continuar al pago?':'Secure WayForPay checkout: '+amount+' UAH at store rate '+rate+' UAH per USD. Continue to payment?'))return false;
 const form=document.createElement('form');form.method='POST';form.action=result.url;form.acceptCharset='UTF-8';form.style.display='none';
 for(const [name,value] of Object.entries(result.fields)){
  for(const item of Array.isArray(value)?value:[value]){
   const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(item);form.append(input);
  }
 }
 document.body.append(form);
 form.submit();
 return true;
}
export async function renderPaymentStatus(id,{api,layout,notice}){
 const r=await api('/payments/status/'+encodeURIComponent(id));
 const p=r.payment;
 const paid=p.status==='approved',review=p.status==='review_required';
 const spanish=document.documentElement.lang==='es';
 const title=paid?(spanish?'Pago confirmado':'Payment confirmed'):review?(spanish?'El pago necesita asistencia':'Payment needs assistance'):p.status==='declined'?(spanish?'Pago rechazado':'Payment declined'):(spanish?'Esperando confirmación del pago':'Waiting for payment confirmation');
 const explanation=paid?(spanish?'Tus clases ya están disponibles en tu cuenta.':'Your lesson access has been updated in your account.'):review?(spanish?'Este pago necesita revisión manual. No vuelvas a pagar hasta que soporte responda.':'The payment needs manual reconciliation. Please do not pay again until support responds.'):p.status==='declined'?(spanish?'El pago no se aceptó. El pedido no se ha activado.':'The payment was not accepted. Your order has not been granted.'):(spanish?'Volver de la página de pago no significa que se haya confirmado. El acceso se activa únicamente tras recibir la confirmación verificada del banco.':'Returning from the payment page is not proof of payment. Access appears only after the bank sends a verified confirmation.');
 const color=paid?'payment-success':review?'payment-warning':'';
 layout('<section class="section muted-section"><div class="section-inner payment-page '+color+'"><p class="eyebrow">SECURE CHECKOUT · LEGWORK</p><h1>'+escapeHtml(title)+'</h1><p class="description">'+escapeHtml(explanation)+'</p><div class="price-card"><h3>Payment #'+p.id+'</h3><p>Provider: '+escapeHtml(p.provider)+'</p><p>Amount: '+(p.uah_kopecks/100).toFixed(2)+' ₴</p><p>Status: <b>'+escapeHtml(p.status.toUpperCase())+'</b></p><p class="meta">Reference: '+escapeHtml(p.reference)+'</p></div><div class="row" style="margin-top:30px"><button id="refreshPayment" data-payment-refresh="'+p.id+'" class="btn btn-outline">CHECK STATUS AGAIN</button><a class="btn btn-red" href="#/account">MY ACCOUNT ↗</a></div></div></section>');
}
export function paymentHistoryMarkup(attempts,config){
 const spanish=document.documentElement.lang==='es';
 if(!attempts.length)return '<p class="description">'+(spanish?'Todavía no hay intentos de pago online.':'No online payment attempts yet.')+'</p>';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 return '<div class="stack">'+attempts.map(a=>'<div class="item-row row"><div><b>Payment #'+a.id+'</b><p class="meta">'+(a.uah_kopecks/100).toFixed(2)+' UAH · '+esc(a.status.toUpperCase())+'</p></div><div class="row"><a class="btn btn-small btn-outline" href="#/payment/'+a.id+'">VIEW STATUS</a>'+(a.status==='pending'&&config?.enabled?'<button type="button" class="btn btn-small btn-red" data-resume-payment="'+a.id+'">CONTINUE PAYMENT</button>':'')+'</div></div>').join('')+'</div>';
}
export function orderSelectionMarkup(orders,config){
 const spanish=document.documentElement.lang==='es';
 const waiting=orders.filter(o=>o.status==='pending');
 if(!waiting.length)return '<p class="description">'+(spanish?'No hay compras pendientes.':'No pending purchases.')+'</p>';
 const explain=config?.enabled?'<p class="description">'+(spanish?'WayForPay cobra en UAH con el cambio de la tienda: 1 USD = ':'Checkout uses WayForPay in UAH at the displayed store conversion rate: 1 USD = ')+escapeHtml(config.rate_uah_per_usd)+(spanish?' UAH. Confirmarás el total antes de continuar al pago seguro.':' UAH. The final amount is confirmed before you leave for the secure payment page.')+'</p>':'<p class="notice">'+(spanish?'El pago online aún no está configurado. Puedes consultar tus pedidos, pero no se cobrará ninguna tarjeta.':'Online checkout is not configured yet. You can review your purchase requests here, but no card will be charged.')+'</p>';
 return '<div class="payment-order-list">'+waiting.map(o=>'<label class="item-row payment-order"><input type="checkbox" data-pay-order value="'+o.id+'" '+(config?.enabled?'':'disabled')+'><span>'+escapeHtml(o.kind)+' #'+o.item_id+' · '+(o.amount/100).toFixed(2)+' USD · '+escapeHtml(o.plan||'self')+'</span><span class="badge-label">PENDING</span></label>').join('')+'</div>'+explain+(config?.enabled?'<button class="btn btn-red" id="beginPayment" type="button">PAY SELECTED ORDERS SECURELY ↗</button>':'');
}
