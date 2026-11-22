/**
 * No credentials or customer data. Launches a disposable local Worker and
 * checks the public/private route contract before anyone deploys to Cloudflare.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const varsFile = path.join(root, '.dev.vars');
const origin = 'http://127.0.0.1:8787';
const vars = {
  SESSION_SECRET: randomBytes(32).toString('hex'),
  ADMIN_PASSWORD: 'LocalTest-' + randomBytes(16).toString('hex'),
  SITE_ORIGIN: origin,
};
let server;
let log = '';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await fs.writeFile(varsFile, Object.entries(vars).map(([k,v]) => k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});
  server = spawn('npx', ['wrangler','dev','--ip','127.0.0.1','--port','8787'], {
    cwd: root, env: process.env, stdio: ['ignore','pipe','pipe'],
  });
  for (const stream of [server.stdout,server.stderr]) {
    stream.on('data', part => { log = (log + String(part)).slice(-25_000); });
  }
  let healthy = false;
  for (let attempt = 0; attempt < 35; attempt++) {
    if (server.exitCode != null) break;
    try {
      const response = await fetch(origin+'/health');
      if (response.ok && (await response.json()).ok === true) { healthy=true; break; }
    } catch {}
    await pause(1000);
  }
  assert(healthy, 'Cloudflare /health not ready. Recent Wrangler output:\n'+log);

  const courses = await fetch(origin+'/api/courses');
  const courseBody = await courses.json();
  assert(courses.ok && courseBody.courses?.length, 'Cloudflare lost public courses');

  const lessons = await fetch(origin+'/api/lessons');
  const lessonBody = await lessons.json();
  assert(lessons.ok && lessonBody.lessons?.length, 'Cloudflare lost lesson catalog');
  assert(!JSON.stringify(lessonBody).includes('video_url'), 'Public catalog exposes private video URL');

  const home = await fetch(origin+'/');
  assert(home.ok && (await home.text()).includes('/css/premium.css'), 'Static homepage styles missing');

  const privatePage = await fetch(origin+'/api/dashboard');
  assert(privatePage.status === 401, 'Private dashboard accessible without authentication');

  const paidLesson = lessonBody.lessons.find(row => !row.free);
  assert(paidLesson, 'No paid lesson to check');
  const denied = await fetch(origin+'/api/lessons/'+paidLesson.id+'/watch');
  assert(denied.status === 401, 'Paid lesson video exposed without authentication');

  const email = await fetch(origin+'/api/email/config');
  assert(email.ok && (await email.json()).enabled === false, 'Unconfigured mail should be disabled');

  // Local smoke runs with an HTTP loopback origin and NODE_ENV=development.
  // Unlike production, development intentionally allows account creation without SMTP.
  const register = await fetch(origin+'/api/auth/register', {
    method:'POST',headers:{'Origin':origin,'Content-Type':'application/json'},
    body:JSON.stringify({name:'Test',email:'test@example.com',password:'NeverUseThisPassword123!'}),
  });
  const registration = await register.json().catch(()=>({}));
  assert(register.ok && registration.user?.email === 'test@example.com',
    'Local development registration failed: '+register.status+' '+JSON.stringify(registration));
  const session = register.headers.get('set-cookie')?.split(';')[0];
  assert(session?.startsWith('legwork_session='), 'Signed-in session cookie not returned');
  const studentDash = await fetch(origin+'/api/dashboard',{headers:{Cookie:session}});
  assert(studentDash.ok, 'Registered student dashboard failed: '+studentDash.status);
  const protectedAdmin = await fetch(origin+'/api/admin/overview',{headers:{Cookie:session}});
  assert(protectedAdmin.status === 403, 'Student accessed protected admin API');
  const unpaidVideo = await fetch(origin+'/api/lessons/'+paidLesson.id+'/watch',{headers:{Cookie:session}});
  assert(unpaidVideo.status === 403, 'Signed-in student accessed unpaid YouTube lesson');
  console.log('Cloudflare local smoke passed: health, catalog, public privacy, account session, student/admin gate, paid video gate and static assets.');
} finally {
  if (server) {
    server.kill('SIGTERM');
    await pause(400);
    if (server.exitCode == null) server.kill('SIGKILL');
  }
  await fs.rm(varsFile,{force:true});
}
