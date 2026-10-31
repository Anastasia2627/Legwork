# Legwork launch checklist

Status: development preview, **NOT ready to charge real customers**.

## Local verification
1. Install Node.js 22 or newer and run npm install.
2. Copy .env.example to .env. Set a strong unique ADMIN_PASSWORD (12+ characters) and a random SESSION_SECRET (generate with openssl rand -hex 32).
3. npm test; npm start; visit http://localhost:3000.
4. Register a student and log in as Admin with the secret you set. Only that account may grant course access.
5. Configure lesson URLs in the admin dashboard. A student without payment verification must receive 403 when requesting a paid lesson.

## Railway preview (requires deliberate deployment and possibly charges)
1. Connect the Anastasia2627/Legwork GitHub repo to a NEW Railway service.
2. Supply NODE_ENV=production, ADMIN_PASSWORD, SESSION_SECRET (32+ random characters), SITE_ORIGIN exactly equal to the final HTTPS origin (for example https://your-subdomain.up.railway.app), and DATABASE_PATH=/data/legwork.sqlite.
3. Attach a persistent volume with mount path /data, and regularly back up its SQLite file; otherwise user accounts and purchases will be lost on redeploy. Railway mounts volumes as root; consult the Railway volume documentation for correct permissions/RAILWAY_RUN_UID, if required.
4. Generate HTTPS domain and check /health.
5. Do not enable commercial sales before a payment provider with verified webhooks is connected.

## Priorities before public launch
- Payment integration: pick merchant/provider, verify signed webhook server side, record external event IDs and implement idempotency; never trust redirects or browser-supplied price.
- Configure a transactional email provider for registration recovery, confirmations and mentorship reviews. The current admin feedback is available in the student account only.
- Provide real videos, optimized original media, real course copy and package prices, instructor bio, testimonials and legally approved policies.
- For strict video protection, migrate from YouTube to a licensed DRM-capable streaming platform; a browser cannot hide an embedded YouTube ID or prevent physical screen capture.
- Move to a managed PostgreSQL and object storage service for multi-instance scaling; SQLite is intentionally a single-node development backend.
- Audit authorization, privacy/consent, passwords, backups and payment accounting; add E2E tests against a deployed preview.
- Complete the Spanish content and per-route indexable SEO/structured data. The current translation is partial, and hash routing is not a production SEO solution.
- Real certificates, certificates issued only after teacher-approved homework, checkout discount mechanics, real shop bundles, Shopify gifts and videos uploads are not implemented.

## Important
ADMIN_PASSWORD is seeded only on the first creation of the admin account. After that, use the **Change password** form in Admin's profile to rotate it. Do not put passwords, YouTube URLs, payment secrets or customer uploads in Git.
