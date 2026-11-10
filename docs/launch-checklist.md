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
- **WayForPay:** the hosted form, HMAC signature validation, attempt ledger, idempotent webhook and access grant are already coded. Register a real merchant, supply exact credentials and explicit approved UAH pricing rate, then run legitimate provider-supported end-to-end tests. Do not approve pending provider invoices by hand.
- **SMTP:** email verification, password reset, queue, notifications, separate consent signups and unsubscribe are coded. Configure a verified sender, transport secrets and DNS records; exercise delivery and bounce/error handling.
- **Media:** staff can replace public HTTPS URLs in Admin Studio → Public Media Library. Provide owner-approved hero footage, five story photos, gallery images, lesson covers and public previews. Short protected lesson/homework MP4/WebM uploads are supported (40 MiB each), but no transcoding, dedicated antivirus scanning, long-video CDN or DRM is supplied.
- **Course and mentorship data:** publish real lesson recordings, prices, copy, delivery times and approved testimonials. Student homework currently uses external HTTPS links.
- **Payments and policy:** decide refunds/chargebacks, tax receipts, commercial terms, privacy/consent, deletion/retention and backups before selling. Automatic refunds are not implemented.
- **Shop promotions:** the 3+1 and Shopify rules have not been activated because eligibility, pricing, dates and external integration details are not confirmed. Do not advertise an enforceable offer until they are approved.
- **Localization and SEO:** the client has EN/ES common interface strings; translate owner-authored custom content, complete SEO/structured data and audit mobile accessibility.
- **Deployment:** persistent SQLite and a backup/restore plan are required. Migrating to a distributed database and object storage is separate follow-on work.

For an exact implementation inventory, see [Functional Status](functional-status.md).

## Important
ADMIN_PASSWORD is seeded only on the first creation of the admin account. After that, use the **Change password** form in Admin's profile to rotate it. Do not put passwords, YouTube URLs, payment secrets or customer uploads in Git.
