import { DurableObject } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import { createDurableSqlite } from './sqlite-adapter.js';
import { secureCloudflareResponse } from './response-security.js';
import { createCloudflareApp } from './generated/app.js';
import { resolveSchoolEnvironment } from './environment.js';

const API_PATHS = ['/api/', '/media/'];
const seo = {
  '/': ['Svitlana Yurchak | Online Dance School', 'Exotic pole dance education, technique classes and personal mentorship.'],
  '/course': ['Legwork Lab | Online Dance Course', 'Develop legwork technique through structured online classes.'],
  '/shop': ['Online Dance Classes & Bundles | Legwork', 'Browse individual pole dance classes and lesson bundles.'],
  '/mentorship': ['Dance Video Mentorship | Legwork', 'Get personal video feedback on your dance technique.'],
};

function internalUrl(path, origin) {
  return new URL(path, origin).toString();
}
function asText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
const security=secureCloudflareResponse;

export class LegworkStore extends DurableObject {
  async fetch(request) {
    const deployment = resolveSchoolEnvironment(this.env, request.url);
    if (!this.server) {
      if (!this.env.SESSION_SECRET || this.env.SESSION_SECRET.length < 32 ||
          !this.env.ADMIN_PASSWORD || this.env.ADMIN_PASSWORD.length < 12) {
        return Response.json({ error: 'Server secrets must be configured before starting LEGWORK' }, { status: 503 });
      }
      const origin = this.env.SITE_ORIGIN || new URL(request.url).origin;
      if (!/^https:\/\//.test(origin) && !['localhost', '127.0.0.1', '::1'].includes(new URL(request.url).hostname)) {
        return Response.json({ error: 'Production requires an HTTPS SITE_ORIGIN' }, { status: 503 });
      }
      const values = {
        NODE_ENV: origin.startsWith('https:') ? 'production' : 'development',
        SITE_ORIGIN: origin,
        SESSION_SECRET: this.env.SESSION_SECRET,
        ADMIN_PASSWORD: this.env.ADMIN_PASSWORD,
        RESEND_API_KEY: this.env.RESEND_API_KEY || '',
        RESEND_WEBHOOK_SECRET: this.env.RESEND_WEBHOOK_SECRET || '',
        MAIL_FROM: this.env.MAIL_FROM || '',
        WAYFORPAY_MERCHANT_ACCOUNT: this.env.WAYFORPAY_MERCHANT_ACCOUNT || '',
        WAYFORPAY_SECRET_KEY: this.env.WAYFORPAY_SECRET_KEY || '',
        WAYFORPAY_UAH_PER_USD: this.env.WAYFORPAY_UAH_PER_USD || '',
        PAYMENT_PROVIDER: this.env.PAYMENT_PROVIDER || 'disabled',
        REGISTRATION_OPEN: this.env.REGISTRATION_OPEN || 'false',
        PUBLIC_INDEXING_ENABLED: 'false',
        TRUST_PROXY_HOPS: '1',
        DEPLOYMENT_STAGE: deployment.stage,
      };
      for (const [key, value] of Object.entries(values)) process.env[key] = String(value);
      try {
        this.db = createDurableSqlite(this.ctx.storage);
        const built = createCloudflareApp(this.db, this.env, this.ctx);
        this.mail = built.mail;
        this.server = built.app.listen(31731);
      } catch (error) {
        console.error('LEGWORK boot error:', error);
        return Response.json({ error: 'LEGWORK initialization failed' }, { status: 503 });
      }
    }
    // This server is private to the Durable Object, never reachable from the public internet.
    return handleAsNodeRequest(31731, request);
  }

  async alarm() {
    // An alarm may run after eviction, before the first external HTTP request.
    // Recreate routes and the outbox service before attempting delivery.
    if (!this.mail && this.env.SITE_ORIGIN) {
      await this.fetch(new Request(new URL('/health', this.env.SITE_ORIGIN)));
    }
    if (this.mail?.dispatch) await this.mail.dispatch();
    if (this.db?.prepare("SELECT 1 FROM mail_outbox WHERE status='pending' AND attempts<8 LIMIT 1").get()) {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
    }
  }
}

export default {
  async fetch(request, env) {
    const deployment = resolveSchoolEnvironment(env, request.url);
    const url = new URL(request.url);
    const path = url.pathname;
    const isDynamic = API_PATHS.some(prefix => path.startsWith(prefix)) || path === '/health';
    if (isDynamic) {
      const headers = new Headers(request.headers);
      // Never trust caller-supplied forwarding headers; Cloudflare sets CF-Connecting-IP.
      headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '127.0.0.1');
      headers.delete('X-Legwork-Internal');
      const forwarded = new Request(request, { headers });
      const object = env.SCHOOL.get(env.SCHOOL.idFromName(deployment.objectName));
      const response = await object.fetch(forwarded);
      // Only successfully assigned public images may reuse a short browser cache.
      // No shared CDN caching of DO responses; all API, health and errors remain uncached.
      const image = path.startsWith('/media/') &&
        ((response.ok && response.headers.get('Content-Type') === 'image/webp') || response.status === 304) &&
        !response.headers.has('Set-Cookie');
      return security(response, { 'Cache-Control': path.startsWith('/api/') ? 'private, no-store' : image ? 'private, max-age=300' : 'no-store' });
    }

    if (path === '/robots.txt') {
      return security(new Response('User-agent: *\nDisallow: /\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      }));
    }
    if (path === '/sitemap.xml') return security(new Response('Not available before publication', { status: 404 }));

    if (Object.hasOwn(seo, path)) {
      const asset = await env.ASSETS.fetch(new Request(internalUrl('/index.html', url.origin)));
      if (!asset.ok) return security(asset);
      const [title, description] = seo[path];
      const tags = [
        '<meta name="robots" content="noindex,nofollow">',
        '<link rel="canonical" href="' + asText(url.origin + path) + '">',
        '<meta property="og:type" content="website">',
        '<meta property="og:title" content="' + asText(title) + '">',
        '<meta property="og:description" content="' + asText(description) + '">',
      ].join('');
      const html = (await asset.text())
        .replace(/<title>[^<]*<\/title>/, '<title>' + asText(title) + '</title>')
        .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + asText(description) + '">')
        .replace('</head>', tags + '</head>');
      return security(new Response(html, { headers: {
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      } }));
    }

    if (path.startsWith('/internal/')) return new Response('Not found', { status: 404 });
    const asset = await env.ASSETS.fetch(request);
    return security(asset);
  },
};
