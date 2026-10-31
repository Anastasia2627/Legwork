/**
 * Editorial dashboard presentation. Fields remain plain text and are HTML escaped.
 */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const labels={eyebrow:'Section label',headlineTop:'Headline · top line',headlineAccent:'Headline · highlighted line',headline:'Headline',intro:'Introduction',cta:'Main button',metaTitle:'Browser title',metaDescription:'Search / link description'};
const longer=new Set(['intro','metaDescription']);
export function editorialEditor(data){
 const pages=['home','course','mentorship'],languages=['en','es'];
 const forms=pages.map(page=>languages.map(lang=>{
  const values=data.content[page][lang],revision=data.revisions[page+':'+lang]??0;
  const fields=Object.entries(values).map(([key,value])=>
   '<label>'+esc(labels[key]||key)+' <small>('+esc(lang.toUpperCase())+')</small>'+
   (longer.has(key)?'<textarea class="field" rows="3" name="'+esc(key)+'" required>'+esc(value)+'</textarea>':'<input class="field" name="'+esc(key)+'" value="'+esc(value)+'" required>')+'</label>'
  ).join('');
  return '<details class="item-row"><summary><b>'+esc(page.toUpperCase())+' · '+esc(lang.toUpperCase())+'</b> <span class="meta">Revision '+revision+'</span></summary>'+
   '<form class="form cms-form" data-editor-page="'+esc(page)+'" data-editor-lang="'+esc(lang)+'" data-revision="'+revision+'">'+fields+
   '<p class="description">Text only. To preserve the design, headlines, labels and SEO fields have server-enforced length limits.</p><button type="submit" class="btn btn-dark">SAVE '+esc(lang.toUpperCase())+' CONTENT</button></form></details>';
 }).join('')).join('');
 return '<h3>WEBSITE TEXT & LANGUAGE EDITOR</h3><p class="description">Update the main heading, introduction, button and search description on each page, independently for English and Spanish. Changes appear immediately on the public site. Never paste tracking scripts or HTML here.</p><div class="stack">'+forms+'</div>';
}
