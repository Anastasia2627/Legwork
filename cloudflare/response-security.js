/**
 * Express Helmet does not cover Workers Static Assets. Keep this policy
 * aligned with the CSP in server.js, including public promo media.
 */
const csp=[
 "default-src 'self'",
 "base-uri 'self'",
 "script-src 'self'",
 "style-src 'self' https://fonts.googleapis.com",
 "style-src-attr 'unsafe-inline'",
 "font-src 'self' https://fonts.gstatic.com",
 "img-src 'self' data: https:",
 "media-src 'self' https: blob:",
 "frame-src 'self' https://www.youtube-nocookie.com",
 "form-action 'self' https://secure.wayforpay.com",
 "connect-src 'self'",
 "object-src 'none'",
 "frame-ancestors 'none'",
 "upgrade-insecure-requests"
].join('; ');

export function secureCloudflareResponse(response,extra={}){
 const headers=new Headers(response.headers);
 headers.set('Content-Security-Policy',csp);
 headers.set('X-Content-Type-Options','nosniff');
 headers.set('Referrer-Policy','strict-origin-when-cross-origin');
 headers.set('X-Frame-Options','DENY');
 headers.set('Strict-Transport-Security','max-age=31536000');
 headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 if((headers.get('Content-Type')||'').toLowerCase().includes('text/html'))headers.set('X-Robots-Tag','noindex, nofollow');
 for(const [name,value] of Object.entries(extra))headers.set(name,value);
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
