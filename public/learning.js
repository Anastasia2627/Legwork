/**
 * Student lesson workspace: two-column desktop player, collapsible mobile syllabus.
 * All lesson/video access comes from /api/learning/:id, never from public catalog data.
 */
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const youtubeId=value=>{
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return null;
  const host=url.hostname.toLowerCase();
  let id=null;
  if(['youtu.be','www.youtu.be'].includes(host)){
   const parts=url.pathname.split('/').filter(Boolean);
   if(parts.length!==1)return null;
   id=parts[0];
  }else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)){
   if(url.pathname==='/watch')id=url.searchParams.get('v');
   else id=/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})\/?$/.exec(url.pathname)?.[1]||null;
  }
  return id&&/^[a-zA-Z0-9_-]{11}$/.test(id)?id:null;
 }catch{return null}
};
const el=(tag,attrs,children)=>{
 const element=document.createElement(tag);
 for(const [key,value] of Object.entries(attrs||{})){
  if(key==='text')element.textContent=value;
  else if(key==='className')element.className=value;
  else if(key==='id')element.id=value;
  else element.setAttribute(key,value);
 }
 if(children)for(const child of children)element.append(child);
 return element;
};
export async function renderStudy(id,{api,layout,notice,lang}){
 const [model,attachmentData]=await Promise.all([api('/learning/'+encodeURIComponent(id)),api('/learning/'+encodeURIComponent(id)+'/materials')]);
 const materials=Array.isArray(attachmentData?.materials)?attachmentData.materials:[];
 if(window.location.hash!=='#/study/'+id)return;
 const l=model.lesson,course=model.course,lessons=model.syllabus;
 const index=lessons.findIndex(x=>x.id===l.id);
 const accessible=lessons.filter(x=>x.accessible);
 const done=accessible.filter(x=>x.completed).length;
 const percent=accessible.length?Math.round(done/accessible.length*100):0;
 const prev=lessons.slice(0,index).reverse().find(x=>x.accessible);
 const next=lessons.slice(index+1).find(x=>x.accessible);
 const spanish=lang==='es';
 const privateHomework=typeof l.homework_url==='string'&&l.homework_url.startsWith('/api/learning/homework-files/');
 const nav=lessons.map(row=>
  '<a class="study-lesson '+(row.id===l.id?'selected':'')+(row.accessible?'':' locked')+'" href="#/'+(row.accessible?'study':'lesson')+'/'+row.id+'">'+
  '<span class="study-check">'+(row.completed?'✓':row.accessible?String(lessons.indexOf(row)+1):'🔒')+'</span>'+
  '<span class="study-row-title"><b>'+htmlEscape(row.title)+'</b><small>'+row.duration+' min · '+htmlEscape(row.kind)+'</small></span></a>'
 ).join('');
 const metadata='<span>'+htmlEscape(l.level)+'</span><span>'+htmlEscape(l.equipment||'Any support')+'</span><span>'+l.duration+' min</span>';
 const container='<div class="study-shell">'+
 '<aside class="study-sidebar" id="studySidebar"><div class="study-sidebar-head"><a href="#/account" class="study-back">← '+(spanish?'Mis cursos':'My courses')+'</a><h3>'+htmlEscape(course.title)+'</h3><span class="badge-label">'+htmlEscape(course.tier==='guru'?'GURU':course.tier==='self'?'SELF-PACED':'SINGLE LESSON')+'</span><p class="meta">'+done+' / '+accessible.length+' '+(spanish?'clases completadas':'lessons completed')+'</p><div class="progress-bar"><i style="width:'+percent+'%"></i></div></div><nav class="study-outline" aria-label="Course curriculum">'+nav+'</nav></aside>'+
 '<article class="study-content"><div class="study-topline"><a href="#/account">← '+(spanish?'Volver al perfil':'Back to dashboard')+'</a><button class="btn btn-small btn-outline study-toggle" id="toggleSyllabus" type="button">'+(spanish?'Programa':'Curriculum')+' ☰</button></div>'+
 '<p class="eyebrow">'+htmlEscape(course.title)+' · '+(index+1)+' / '+lessons.length+'</p>'+
 '<h1 class="study-title">'+htmlEscape(l.title)+'</h1><div class="study-meta">'+metadata+'</div>'+
 '<div id="studyVideoHost" class="study-video-host"></div>'+
 '<div class="study-controls"><div class="study-pagination">'+(prev?'<a class="btn btn-outline" href="#/study/'+prev.id+'">← '+(spanish?'Anterior':'Previous')+'</a>':'<span></span>')+(next?'<a class="btn btn-outline" href="#/study/'+next.id+'">'+(spanish?'Siguiente':'Next')+' →</a>':'<span></span>')+'</div>'+
 '<button type="button" id="studyComplete" class="btn '+(l.completed?'btn-outline':'btn-red')+'">'+(l.completed?(spanish?'✓ Completada · Desmarcar':'✓ Completed · Undo'):(spanish?'Marcar como completada':'Mark as completed'))+'</button></div>'+
'<section class="study-materials"><p class="eyebrow">'+(spanish?'MATERIALES':'STUDY MATERIALS')+'</p><h2>'+(spanish?'Guías de esta clase':'Lesson PDF notes')+'</h2>'+
 (materials.length?'<div class="study-material-list">'+materials.map(m=>'<a class="study-material-link" href="/api/learning/materials/'+m.id+'/download" download><span><strong>'+htmlEscape(m.title)+'</strong><small>PDF · '+Math.ceil(m.bytes/1024)+' KB</small></span><span>↓ '+(spanish?'Descargar':'Download')+'</span></a>').join('')+'</div>':
 '<p class="description">'+(spanish?'La profesora aún no ha subido notas para esta clase.':'No PDF study notes have been published for this lesson yet.')+'</p>')+
 '</section>'+
 '<section class="study-homework"><p class="eyebrow">'+(spanish?'PRÁCTICA':'YOUR PRACTICE')+'</p><h2>'+(spanish?'Entrega de tarea':'Homework submission')+'</h2><p class="description">'+(spanish?'Comparte un enlace seguro a tu video de práctica. El feedback personal está incluido en el plan Guru.':'Share a secure link to your practice video. Personalized instructor feedback is included in the Guru plan.')+'</p>'+
 '<form id="studyHomeworkForm" class="form"><label for="homeworkUrl">'+(spanish?'Enlace de tarea (HTTPS)':'Homework video link (HTTPS)')+'</label><input class="field" type="url" id="homeworkUrl" name="homework" value="'+htmlEscape(privateHomework?'':l.homework_url)+'" placeholder="https://" autocomplete="off"><button type="submit" class="btn btn-dark">'+(spanish?'Guardar entrega':'Save homework link')+'</button></form>'+

 (privateHomework?'<div class="study-private-attachment"><a href="'+htmlEscape(l.homework_url)+'" download class="btn btn-outline btn-small">'+(spanish?'Descargar mi tarea adjunta':'Download my private attachment')+'</a><button type="button" id="studyDeleteHomeworkFile" class="btn btn-outline btn-small">'+(spanish?'Eliminar archivo':'Remove attachment')+'</button></div>':'')+
 (course.tier==='guru'?'<form id="studyFileUploadForm" class="study-file-form"><label for="studyUploadFile">'+(spanish?'Adjuntar PDF o imagen (máx 1 MB)':'Or upload a private PDF/image (max 1 MiB)')+'</label><input type="file" class="field" id="studyUploadFile" name="practice_file" accept="application/pdf,image/jpeg,image/png,image/webp" required><button type="submit" class="btn btn-outline">'+(spanish?'Enviar archivo':'Submit private attachment')+'</button><small>'+(spanish?'Los videos grandes se envían por enlace HTTPS.':'Large practice videos must be shared using a private HTTPS link.')+'</small></form>':
 '<p class="description">'+(spanish?'La subida de archivos está disponible en el plan Guru.':'Private file uploads are available with the Guru plan.')+'</p>')+
 (l.teacher_feedback?'<div class="study-feedback"><b>'+(spanish?'Respuesta de la profesora':'Instructor feedback')+'</b><p>'+htmlEscape(l.teacher_feedback)+'</p></div>':'')+'</section>'+
 '<p class="study-note">'+(spanish?'El acceso a esta página se comprueba con tu cuenta. Los enlaces de YouTube no pueden protegerse completamente contra compartirlos o grabar la pantalla.':'Course access on this website is tied to your account. YouTube links cannot be fully protected from sharing or screen recording.')+'</p>'+
 '</article></div>';
 layout(container);
 const host=document.getElementById('studyVideoHost');
 const url=l.video_url;
 const idYouTube=url?youtubeId(url):null;
 if(idYouTube){
  host.append(el('iframe',{src:'https://www.youtube-nocookie.com/embed/'+idYouTube+'?rel=0&playsinline=1',title:l.title+' · Legwork',loading:'lazy',referrerpolicy:'strict-origin-when-cross-origin',allow:'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen',allowfullscreen:'true'}));
 }else if(url){
  host.append(el('div',{className:'study-video-empty'},[el('p',{text:spanish?'La dirección del video debe ser un enlace válido de YouTube. Contacta con la escuela.':'The instructor must provide a valid YouTube link. Please contact the school.'})]));
 }else{
  host.append(el('div',{className:'study-video-empty'},[el('span',{className:'study-play-icon',text:'▶'}),el('p',{text:spanish?'La profesora aún no ha publicado este video.':'The instructor has not published this video yet.'})]));
 }
 const save=async(completed,homework_url)=>{
  await api('/progress/'+l.id,'POST',{completed,homework_url});
  notice(spanish?'Progreso guardado':'Progress saved');
  await renderStudy(l.id,{api,layout,notice,lang});
 };
 document.getElementById('toggleSyllabus')?.addEventListener('click',()=>document.getElementById('studySidebar')?.classList.toggle('open'));
 document.getElementById('studyComplete')?.addEventListener('click',()=>save(!l.completed,(document.getElementById('homeworkUrl').value.trim()||(privateHomework?l.homework_url:''))).catch(e=>notice(e.message)));
 document.getElementById('studyHomeworkForm')?.addEventListener('submit',event=>{
  event.preventDefault();event.stopPropagation();
  save(l.completed,(document.getElementById('homeworkUrl').value.trim()||(privateHomework?l.homework_url:''))).catch(e=>notice(e.message));
 });
 const upload=document.getElementById('studyFileUploadForm');
 upload?.addEventListener('submit',async event=>{
  event.preventDefault();event.stopPropagation();
  const file=document.getElementById('studyUploadFile')?.files?.[0];
  if(!file){notice(spanish?'Selecciona un archivo':'Choose a file');return}
  if(file.size>1024*1024){notice(spanish?'Máximo 1 MB':'File limit is 1 MiB');return}
  const button=upload.querySelector('button[type="submit"]');if(button)button.disabled=true;
  try{
   const response=await fetch('/api/learning/'+l.id+'/homework-file',{method:'POST',
    credentials:'same-origin',headers:{'Content-Type':file.type,'Origin':location.origin},body:file});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||'Attachment upload failed');
   notice(spanish?'Archivo guardado':'Private homework attachment saved');
   await renderStudy(l.id,{api,layout,notice,lang});
  }catch(error){notice(error.message);if(button)button.disabled=false}
 });
 document.getElementById('studyDeleteHomeworkFile')?.addEventListener('click',async()=>{
  if(!window.confirm(spanish?'¿Eliminar el archivo enviado?':'Remove this submitted private file?'))return;
  try{
   await api('/learning/'+l.id+'/homework-file','DELETE');
   notice(spanish?'Archivo eliminado':'Private attachment removed');
   await renderStudy(l.id,{api,layout,notice,lang});
  }catch(error){notice(error.message)}
 });

 try{await api('/account/activity','POST',{lesson_id:l.id})}catch{/* Viewing is still permitted when activity tracking is unavailable. */}
}
