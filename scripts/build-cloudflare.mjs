/**
 * Build a Cloudflare-specific entrypoint from the tested Node.js application.
 *
 * This keeps Node and Cloudflare routes in sync without hand-maintaining two
 * large copies of the LEGWORK backend. Fails loudly if the upstream app shape
 * changes, so CI can block accidental deployment of incomplete code.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'cloudflare/generated');
fs.mkdirSync(output, { recursive: true });

const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (name, body) => fs.writeFileSync(path.join(output, name), body);
function change(source, oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error('Cloudflare build contract changed: ' + label);
  return source.replace(oldText, newText);
}

// Keep ALL of the existing route code and server-side permissions.
let app = read('server.js');
for (const line of [
  "import 'dotenv/config';\n",
  "import Database from 'better-sqlite3';\n",
  "import fs from 'node:fs';\n",
  "import path from 'node:path';\n",
  "import {EDITORIAL_DEFAULTS} from './lib/editorial.js';\n",
]) app = change(app, line, '', 'app import ' + line.trim());
app = app.replaceAll("from './lib/", "from '../../lib/");
app = change(app, "from '../../lib/mailing.js'", "from './mailing.js'", 'mail module');
app = change(app, "from '../../lib/certificates.js'", "from './certificates.js'", 'certificate module');
app = change(app, "from '../../lib/image-upload.js'", "from '../image-upload.js'", 'image module');
app = change(app,
  "const app=express(),port=Number(process.env.PORT||3000),prod=process.env.NODE_ENV==='production',dbPath=process.env.DATABASE_PATH||'./data/legwork.sqlite';",
  "export function createCloudflareApp(db, env, ctx) {\nconst app=express(),prod=process.env.NODE_ENV==='production',dbPath=':durable-object:';",
  'app factory');
app = change(app,
  "fs.mkdirSync(path.dirname(dbPath),{recursive:true});const db=new Database(dbPath);db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');",
  "db.pragma('foreign_keys=ON');",
  'database initialization');
app = change(app,
  "const mail=createMailService(app,db,{auth,hashPassword,cleanText});",
  "const mail=createMailService(app,db,{auth,hashPassword,cleanText,env,ctx});",
  'mail setup');
app = change(app,
  "registerImageUploads(app,db,{auth,admin,dbPath});",
  "registerImageUploads(app,db,{auth,admin,env});",
  'image upload setup');
const seoStart = app.indexOf('// Public, crawlable paths are deliberately limited to editorial landing pages.');
if (seoStart === -1) throw new Error('Cloudflare build contract changed: SEO tail');
app = app.slice(0, seoStart) + `
app.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1 AS ready').get();
    return res.set('Cache-Control', 'no-store').json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false });
  }
});
app.use((err, req, res, next) => {
  console.error('Cloudflare API error:', err);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});
return { app, mail };
}
`;
write('app.js', app);

// Use transactional email via an HTTP API instead of SMTP TCP and background
// Node timers. All verification/reset token checks and SQL logic stay intact.
let mail = read('lib/mailing.js');
mail = change(mail, "import fs from 'node:fs';\n", '', 'mail fs');
mail = change(mail, "import nodemailer from 'nodemailer';\n", '', 'mail nodemailer');
mail = change(mail, 'export function createMailService(app,db,{auth,hashPassword,cleanText}){',
  'export function createMailService(app,db,{auth,hashPassword,cleanText,env,ctx}){', 'mail factory');
const testLine = " const inTest=process.env.NODE_ENV==='test'&&!!process.env.MAIL_TEST_OUTBOX_PATH;";
mail = change(mail, testLine, " const inTest=false;", 'mail test mode');
const smtpLine = " const smtp=!!(process.env.SMTP_HOST&&process.env.SMTP_FROM&&process.env.SMTP_PORT&&((process.env.SMTP_USER&&process.env.SMTP_PASSWORD)||process.env.SMTP_NO_AUTH==='true'));";
mail = change(mail, smtpLine, " const smtp=!!(env.RESEND_API_KEY&&env.MAIL_FROM);", 'mail provider');
const transportStart = mail.indexOf(' let transport=null;');
const transportEnd = mail.indexOf(' const from=', transportStart);
if (transportStart === -1 || transportEnd === -1) throw new Error('Cloudflare build contract changed: email transport');
mail = mail.slice(0, transportStart) + `
 const transport={
  async sendMail({to,subject,text}){
   const result=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:env.MAIL_FROM,to:[to],subject,text})
   });
   if(!result.ok)throw Error('Email provider rejected delivery');
  }
 };
` + mail.slice(transportEnd);
mail = change(mail, " const from=process.env.SMTP_FROM||'Legwork <test@legwork.example>';",
  " const from=env.MAIL_FROM||'Legwork <test@legwork.example>';", 'from address');
mail = change(mail,
  "  setImmediate(()=>{dispatch().catch(err=>console.error('Mail outbox worker:',err.code||'query error'))});",
  "  ctx.waitUntil(dispatch().catch(err=>console.error('Mail outbox delivery:',err.code||'query error')));\n  ctx.waitUntil(ctx.storage.setAlarm(Date.now()+60_000));",
  'mail event dispatch');
const sendStart = mail.indexOf('     if(inTest){');
const sendEnd = mail.indexOf("     db.prepare('UPDATE mail_outbox SET", sendStart);
if (sendStart === -1 || sendEnd === -1) throw new Error('Cloudflare build contract changed: mail dispatch');
mail = mail.slice(0, sendStart) +
  "     await transport.sendMail({from,to:item.recipient,subject,text});\n" +
  mail.slice(sendEnd);
const workerStart = mail.indexOf(' if(enabled){const worker=setInterval(');
const workerEnd = mail.indexOf('\n', workerStart);
if (workerStart === -1 || workerEnd === -1) throw new Error('Cloudflare build contract changed: mail worker timer');
mail = mail.slice(0, workerStart) +
  " if(enabled)ctx.waitUntil(dispatch().catch(err=>console.error('Mail outbox startup:',err.code||'query error')));" +
  mail.slice(workerEnd);
write('mailing.js', mail);

// PDFKit already generates LEGWORK's certificate template. Replace only its
// Node filesystem font lookup with bundled font data for the Workers runtime.
let certificate = read('lib/certificates.js');
certificate = change(certificate, "import fs from 'node:fs';\n", '', 'certificate fs');
certificate = change(certificate, "import path from 'node:path';\n", '', 'certificate path');
const fontStart = certificate.indexOf('const fonts={');
const fontEnd = certificate.indexOf('\n};', fontStart);
if (fontStart === -1 || fontEnd === -1) throw new Error('Cloudflare build contract changed: fonts');
certificate = certificate.slice(0, fontStart) +
  "import latinFont from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff';\n" +
  "import cyrillicFont from '@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff';\n" +
  "const fonts={latin:Buffer.from(latinFont),cyrillic:Buffer.from(cyrillicFont)};" +
  certificate.slice(fontEnd + 3);
certificate = change(certificate,
  " if(!fs.existsSync(fonts.latin)||!fs.existsSync(fonts.cyrillic))throw Error('Noto Sans font dependencies missing');\n",
  '', 'certificate font availability');
write('certificates.js', certificate);
console.log('Cloudflare server, email and certificate adapters generated successfully.');
