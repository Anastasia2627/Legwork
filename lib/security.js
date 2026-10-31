import crypto from 'node:crypto';
export function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return salt+':'+crypto.scryptSync(password,salt,64).toString('hex')}
export function verifyPassword(password,record){if(!record||!record.includes(':'))return false;const [salt,hash]=record.split(':');const candidate=crypto.scryptSync(password,salt,64);const stored=Buffer.from(hash,'hex');return stored.length===candidate.length&&crypto.timingSafeEqual(stored,candidate)}
export function newToken(){return crypto.randomBytes(32).toString('hex')}
export function tokenHash(token){const key=process.env.SESSION_SECRET||'legwork-local-dev-session-key-not-for-production';return crypto.createHmac('sha256',key).update(token).digest('hex')}
export function safeExternalUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname)&&!u.hostname.endsWith('.local')}catch{return false}}
export function cleanText(value,max=1000){return String(value??'').trim().slice(0,max)}
