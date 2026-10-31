const isSpanish=()=>document.documentElement.lang==='es';
const say=(en,es)=>isSpanish()?es:en;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export function studentCertificatesMarkup(items){
 if(!items.length)return '<p class="description">Certificates are offered with Guru course enrollments. Your courses will appear here when enrolled.</p>';
 return '<div class="stack">'+items.map(x=>{
  const c=x.certificate;
  const body=c?(c.revoked_at?'<p class="notice">This certificate has been revoked. Contact the school for details.</p>':'<p class="certificate-success">'+say('Certificate issued on ','Certificado emitido el ')+esc(c.issued_at.slice(0,10))+'</p><div class="row"><a class="btn btn-red" href="/api/certificates/'+encodeURIComponent(c.serial)+'/pdf">DOWNLOAD PDF ↓</a><a href="#/verify-certificate/'+encodeURIComponent(c.serial)+'" class="btn btn-outline">VERIFY ONLINE</a></div>'):
    '<p class="description">'+say('Completed: ','Completadas: ')+x.completed+'/'+x.total+say(' · Homework submitted: ',' · Entregadas: ')+x.submitted+'/'+x.total+say(' · Instructor approved: ',' · Aprobadas: ')+x.approved+'/'+x.total+'</p><p>'+(x.eligible?'All requirements approved. Waiting for final certificate issuance by the school.':'Complete every lesson, submit homework and receive instructor approval.')+'</p>';
  return '<div class="item-row certificate-item"><span class="eyebrow">GURU · COURSE CERTIFICATE</span><h3>'+esc(x.course_title)+'</h3>'+body+'</div>';
 }).join('')+'</div>';
}
export function adminCertificatesMarkup(state){
 const candidates=state.courses.map(x=>{
  const c=x.certificate;
  return '<div class="item-row"><p class="eyebrow">'+say('STUDENT #','ALUMNO #')+x.user_id+say(' · COURSE #',' · CURSO #')+x.course_id+'</p><h3>'+esc(x.student_name)+' — '+esc(x.course_title)+'</h3><p class="meta">'+x.completed+'/'+x.total+''+say(' complete · ',' completadas · ')+x.submitted+'/'+x.total+say(' submitted · ',' entregadas · ')+x.approved+'/'+x.total+say(' instructor approved',' aprobadas')</p>'+(c?'<span class="badge-label">'+(c.revoked_at?'REVOKED':'ISSUED')+'</span><p class="meta">Certificate: '+esc(c.serial)+'</p>':x.eligible?'<button type="button" class="btn btn-red btn-small" data-issue-certificate="'+x.user_id+'-'+x.course_id+'">ISSUE CERTIFICATE</button>':'<p class="description">Waiting for all required approvals.</p>')+'</div>';
 }).join('');
 const issued=state.issued.map(c=>'<div class="item-row row"><div><b>'+esc(c.student_name)+' · '+esc(c.course_title)+'</b><p class="meta">'+esc(c.serial)+' · '+esc(c.issued_at.slice(0,10))+' · '+(c.revoked_at?say('Revoked','Revocado'):say('Valid','Válido'))+'</p></div><div class="row"><a class="btn btn-outline btn-small" href="/api/certificates/'+esc(c.serial)+'/pdf">PDF</a>'+(c.revoked_at?'':'<button type="button" class="btn btn-outline btn-small" data-revoke-certificate="'+esc(c.serial)+'">REVOKE</button>')+'</div></div>').join('');
 return '<h3>COURSE CERTIFICATES · INSTRUCTOR APPROVAL</h3><p class="description">Self-reported completion is not enough. All required homework must be accepted by an administrator, followed by explicit certificate issuance.</p><div class="stack">'+(candidates||'<p>No Guru students yet.</p>')+'</div><h3>ISSUED CERTIFICATES</h3><div class="stack">'+(issued||'<p>No certificates issued yet.</p>')+'</div>';
}
export async function verifyCertificateView(serial,{api,layout}){
 const safe=/^[a-f0-9-]{36}$/.test(serial);
 if(!safe)return layout('<section class="section muted-section"><h2>INVALID CERTIFICATE ID</h2><p>Verification is unavailable.</p></section>');
 try{
  const c=await api('/certificates/verify/'+serial);
  layout('<section class="section muted-section"><div class="section-inner certificate-verify"><p class="eyebrow">LEGWORK · CERTIFICATE VERIFICATION</p><h1>'+(c.valid?'VERIFIED CERTIFICATE':'CERTIFICATE REVOKED')+'</h1><div class="price-card"><p class="eyebrow">STUDENT</p><h2>'+esc(c.student_name)+'</h2><p class="eyebrow">COURSE</p><h3>'+esc(c.course_title)+'</h3><p>'+say('Issued ','Emitido el ')+esc(c.issued_at.slice(0,10))+'</p><p class="meta">'+say('Certificate ID: ','Número de certificado: ')+esc(c.serial)+'</p><p class="notice">'+(c.valid?'Issued by Legwork Online School. Confirms course completion, not professional accreditation.':'This certificate has been revoked by the school and is no longer valid.')+'</p></div><a class="btn btn-outline" href="#/">BACK TO SCHOOL</a></div></section>');
 }catch{layout('<section class="section muted-section"><div class="section-inner"><h2>CERTIFICATE NOT FOUND</h2><p>No issued certificate matches this reference.</p><a href="#/">Return to Legwork</a></div></section>')}
}
