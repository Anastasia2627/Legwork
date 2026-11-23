import test from 'node:test';
import assert from 'node:assert/strict';
import {secureCloudflareResponse} from '../cloudflare/response-security.js';

test('Cloudflare HTML pages receive a CSP, deny framing and permit public promo videos',()=>{
 const secured=secureCloudflareResponse(new Response('<html></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}}));
 const h=secured.headers,csp=h.get('content-security-policy');
 assert.equal(h.get('x-content-type-options'),'nosniff');
 assert.equal(h.get('x-frame-options'),'DENY');
 assert.match(h.get('x-robots-tag'),/noindex/);
 assert.match(h.get('strict-transport-security'),/max-age=31536000/);
 assert.match(csp,/default-src 'self'/);
 assert.match(csp,/media-src 'self' https: blob:/);
 assert.match(csp,/frame-src 'self' https:\/\/www\.youtube-nocookie\.com/);
 assert.match(csp,/form-action 'self' https:\/\/secure\.wayforpay\.com/);
 assert.match(csp,/frame-ancestors 'none'/);
 assert.match(csp,/object-src 'none'/);
 assert.match(csp,/style-src-attr 'unsafe-inline'/);
 assert.ok(!csp.includes('unsafe-eval'));
});
test('Security wrapping retains cookies, status, body and private cache',async()=>{
 const raw=new Response('{"ok":true}',{status:201,headers:{'Content-Type':'application/json','Set-Cookie':'legwork_session=test; HttpOnly'}});
 const secured=secureCloudflareResponse(raw,{'Cache-Control':'private, no-store'});
 assert.equal(secured.status,201);
 assert.equal(secured.headers.get('set-cookie'),'legwork_session=test; HttpOnly');
 assert.equal(secured.headers.get('cache-control'),'private, no-store');
 assert.equal(secured.headers.get('x-robots-tag'),null);
 assert.equal(await secured.text(),'{"ok":true}');
});
