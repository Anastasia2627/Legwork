/**
 * Student lesson workspace: two-column desktop player, collapsible mobile syllabus.
 * All lesson/video access comes from /api/learning/:id, never from public catalog data.
 */
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const youtubeId=value=>{
 try{
  const u=new URL(value);let id='';
  if(['youtu.be','www.youtu.be'].includes(u.hostname))id=u.pathname.slice(1);
  else if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(u.hostname))
    id=u.searchParams.get('v')||u.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1]||'';
  return /^[\w-]{11}$/.test(id)?id:null;
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
 const model=await api('/learning/'+encodeURIComponent(id));
 const l=model.lesson,course=model.course,lessons=model.syllabus;
 const index=lessons.findIndex(x=>x.id===l.id);
 const accessible=lessons.filter(x=>x.accessible);
 const done=accessible.filter(x=>x.completed).length;
 const percent=accessible.length?Math.round(done/accessible.length*100):0;
 const prev=lessons.slice(0,index).reverse().find(x=>x.accessible);
 const next=lessons.slice(index+1).find(x=>x.accessible);
 const spanish=lang==='es';
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
 '<section class="study-homework"><p class="eyebrow">'+(spanish?'PRÁCTICA':'YOUR PRACTICE')+'</p><h2>'+(spanish?'Entrega de tarea':'Homework submission')+'</h2><p class="description">'+(spanish?'Comparte un enlace seguro a tu video de práctica. El feedback personal está incluido en el plan Guru.':'Share a secure link to your practice video. Personalized instructor feedback is included in the Guru plan.')+'</p>'+
 '<form id="studyHomeworkForm" class="form"><label for="homeworkUrl">'+(spanish?'Enlace de tarea (HTTPS)':'Homework video link (HTTPS)')+'</label><input class="field" type="url" id="homeworkUrl" name="homework" value="'+htmlEscape(l.homework_url)+'" placeholder="https://" autocomplete="off"><button type="submit" class="btn btn-dark">'+(spanish?'Guardar entrega':'Save homework link')+'</button></form>'+
 (l.teacher_feedback?'<div class="study-feedback"><b>'+(spanish?'Respuesta de la profesora':'Instructor feedback')+'</b><p>'+htmlEscape(l.teacher_feedback)+'</p></div>':'')+'</section>'+
 '<p class="study-note">'+(spanish?'Los videos son para uso personal. YouTube no permite bloquear completamente las grabaciones de pantalla.':'Lessons are for personal viewing. YouTube does not provide guaranteed screen-capture prevention.')+'</p>'+
 '</article></div>';
 layout(container);
 const host=document.getElementById('studyVideoHost');
 const url=l.video_url;
 const idYouTube=url?youtubeId(url):null;
 if(idYouTube){
  host.append(el('iframe',{src:'https://www.youtube-nocookie.com/embed/'+idYouTube+'?rel=0&modestbranding=1',title:l.title+' · Legwork',loading:'lazy',referrerpolicy:'strict-origin-when-cross-origin',allow:'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen',allowfullscreen:'true'}));
 }else if(url){
  const safe=new URL(url);
  if(safe.protocol==='https:'){
   host.append(el('div',{className:'study-video-empty'},[el('p',{text:spanish?'El video se abre en una plataforma externa.':'This video is hosted on another platform.'}),el('a',{href:safe.toString(),target:'_blank',rel:'noopener noreferrer',className:'btn btn-red',text:spanish?'Abrir video ↗':'Open lesson video ↗'})]));
  }
 }else{
  host.append(el('div',{className:'study-video-empty'},[el('span',{className:'study-play-icon',text:'▶'}),el('p',{text:spanish?'La profesora aún no ha publicado este video.':'The instructor has not published this video yet.'})]));
 }
 const save=async(completed,homework_url)=>{
  await api('/progress/'+l.id,'POST',{completed,homework_url});
  notice(spanish?'Progreso guardado':'Progress saved');
  await renderStudy(l.id,{api,layout,notice,lang});
 };
 document.getElementById('toggleSyllabus')?.addEventListener('click',()=>document.getElementById('studySidebar')?.classList.toggle('open'));
 document.getElementById('studyComplete')?.addEventListener('click',()=>save(!l.completed,document.getElementById('homeworkUrl').value.trim()).catch(e=>notice(e.message)));
 document.getElementById('studyHomeworkForm')?.addEventListener('submit',event=>{
  event.preventDefault();event.stopPropagation();
  save(l.completed,document.getElementById('homeworkUrl').value.trim()).catch(e=>notice(e.message));
 });
 try{await api('/account/activity','POST',{lesson_id:l.id})}catch{/* Viewing is still permitted when activity tracking is unavailable. */}
}
