/*
 * Media catalog. Replace remote preview sources with approved assets before launch.
 * Publicly viewable photographs are NOT automatically licensed for commercial reuse.
 * Keep attribution visible during internal testing and obtain owner approval.
 */
export const MEDIA = Object.freeze({
 portrait: Object.freeze({
  src: 'https://poleconvention.com/wp-content/uploads/2024/04/IMG_8435-683x1024.jpeg',
  alt: 'Svitlana Yurchak in a pink editorial portrait for her PoleCon interview',
  credit: 'PoleCon · 2024 interview',
  source: 'https://poleconvention.com/interview/interview-with-new-polecon-instructor-svitlana-yurchak/'
 }),
 stage: Object.freeze({
  src: 'https://img.tsn.ua/cached/361/tsn-6fc5c486b67f33b84a28d75a8717b561/thumbs/1200x630/27/df/1e586525e5e34249f493144a13f2df27.jpeg',
  alt: 'Svitlana Yurchak performing on the Ukraine’s Got Talent stage',
  credit: 'TSN · Ukraine’s Got Talent coverage',
  source: 'https://tsn.ua/ukrayina/z-odyagu-sami-motuzochki-simeyna-likarka-iz-zaporizhzhya-vrazila-ukrayinciv-shok-kontentom-video-1909108.html'
 })
});
export function mediaFigure(key, className='photo-frame'){
 const asset=MEDIA[key];
 if(!asset)return '';
 const safeClass=className.replace(/[^a-zA-Z0-9\s_-]/g,'');
 return '<figure class="'+safeClass+'"><img class="media-photo" loading="lazy" decoding="async" src="'+asset.src+'" alt="'+asset.alt+'"><figcaption class="photo-credit">Image: <a href="'+asset.source+'" target="_blank" rel="noopener noreferrer">'+asset.credit+'</a></figcaption></figure>';
}