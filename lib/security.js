import crypto from 'node:crypto';
export function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return salt+':'+crypto.scryptSync(password,salt,64).toString('hex')}
export function verifyPassword(password,record){if(!record||!record.includes(':'))return false;const [salt,hash]=record.split(':');const candidate=crypto.scryptSync(password,salt,64);const stored=Buffer.from(hash,'hex');return stored.length===candidate.length&&crypto.timingSafeEqual(stored,candidate)}
export function newToken(){return crypto.randomBytes(32).toString('hex')}
export function tokenHash(token){const key=process.env.SESSION_SECRET||'legwork-local-dev-session-key-not-for-production';return crypto.createHmac('sha256',key).update(token).digest('hex')}
export function safeExternalUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname)&&!u.hostname.endsWith('.local')}catch{return false}}
export function cleanText(value,max=1000){return String(value??'').trim().slice(0,max)}

/** Only canonical HTTPS YouTube video URLs are valid paid lesson sources. */
export function youtubeVideoId(value){
 if(typeof value!=='string'||value.length>1200)return null;
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return null;
  const host=u.hostname.toLowerCase();
  let id=null;
  if(['youtu.be','www.youtu.be'].includes(host)){
   const segments=u.pathname.split('/').filter(Boolean);
   if(segments.length!==1)return null;
   id=segments[0];
  }else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)){
   if(u.pathname==='/watch')id=u.searchParams.get('v');
   else{
    const matched=/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})\/?$/.exec(u.pathname);
    id=matched?.[1]||null;
   }
  }
  return id&&/^[a-zA-Z0-9_-]{11}$/.test(id)?id:null;
 }catch{return null}
}
