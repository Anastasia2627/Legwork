/**
 * Staff-only, read-only preview of unsaved lesson form values.
 * Never embeds YouTube automatically or uploads a file before explicit Save.
 */
const blobPreviews=new Map();

export function youtubeWatchUrl(value){
 const raw=String(value||'').trim();
 if(!raw)return '';
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  let id='';
  if(host==='youtu.be')id=url.pathname.split('/')[1]||'';
  else if(host==='youtube.com'||host==='youtube-nocookie.com'){
   const path=url.pathname.split('/').filter(Boolean);
   if(url.pathname==='/watch')id=url.searchParams.get('v')||'';
   else if(['shorts','embed','live'].includes(path[0]))id=path[1]||'';
  }else if(host==='m.youtube.com'&&url.pathname==='/watch')id=url.searchParams.get('v')||'';
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id))return '';
  return 'https://www.youtube.com/watch?v='+id;
 }catch{return ''}
}

export function safeCoverPreviewUrl(value){
 const raw=String(value||'').trim();
 if(!raw||raw.includes('\\')||/[\u0000-\u001F\u007F]/.test(raw))return '';
 if(/^\/media\/[a-zA-Z0-9/_-]+(?:\.webp)?$/.test(raw))return raw;
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
  return url.href;
 }catch{return ''}
}

export function releaseAdminLessonPreviews(){
 for(const {url} of blobPreviews.values())URL.revokeObjectURL(url);
 blobPreviews.clear();
}

export function updateAdminLessonPreview(form){
 if(!form?.matches?.('[data-lesson-preview]'))return;
 const preview=form.querySelector('[data-preview-root]');
 if(!preview)return;
 const value=(name)=>form.elements.namedItem(name)?.value||'';
 const title=value('title').trim()||'Untitled lesson';
 const category=value('category').trim()||'LEGWORK';
 const level=value('level').trim()||'All levels';
 const duration=Number(value('duration'));
 const price=Number(value('price'));
 const free=!!form.elements.namedItem('free')?.checked;
 const file=form.elements.namedItem('upload_image')?.files?.[0]||null;
 let cached=blobPreviews.get(form);
 if(cached&&cached.file!==file){
  URL.revokeObjectURL(cached.url);
  blobPreviews.delete(form);
  cached=null;
 }
 let cover='';
 let status='';
 if(file){
  if(['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size>=16&&file.size<=6*1024*1024){
   if(!cached){
    cached={file,url:URL.createObjectURL(file)};
    blobPreviews.set(form,cached);
   }
   cover=cached.url;
   status='Previewing selected image. It will be uploaded only when you save.';
  }else status='Choose a JPEG, PNG or WebP under 6 MB.';
 }else{
  cover=safeCoverPreviewUrl(value('cover_url'));
  status=value('cover_url').trim()&&!cover?'Only an HTTPS URL or /media/ image path can be previewed.':'';
 }
 const set=(slot,text)=>{const node=preview.querySelector('[data-preview-'+slot+']');if(node)node.textContent=text};
 set('title',title);
 set('category',category);
 set('meta',level+' · '+(Number.isFinite(duration)&&duration>0?duration+' min':'Duration not set'));
 set('price',free?'FREE':Number.isFinite(price)&&price>=0?'$'+(price/100).toFixed(2):'Set a valid price');
 set('image-status',status);
 const img=preview.querySelector('[data-preview-image]');
 const blank=preview.querySelector('[data-preview-placeholder]');
 if(img){
  if(cover){img.src=cover;img.alt=title+' cover preview';img.hidden=false;}
  else{img.removeAttribute('src');img.alt='';img.hidden=true;}
 }
 if(blank)blank.hidden=!!cover;
 const youtube=value('video_url').trim();
 const watch=youtubeWatchUrl(youtube);
 set('video',watch?'YouTube link format looks valid (playback not checked)':youtube?'Invalid YouTube link — use an HTTPS watch, live, shorts or youtu.be URL':'No video yet — you can finish the cover and description first');
 const link=preview.querySelector('[data-preview-video-link]');
 if(link){
  if(watch){link.href=watch;link.hidden=false;}
  else{link.removeAttribute('href');link.hidden=true;}
 }
}
