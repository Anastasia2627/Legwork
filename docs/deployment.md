# Legwork — release and deployment guide

## Current status

The application can run in a single Node.js 22 process with a persistent SQLite database. It is NOT ready to charge real buyers merely because it runs on a hosting provider. Merchant acquiring, SMTP, published course material and legal policies must be verified separately. Until that work is done, leave PUBLIC_INDEXING_ENABLED=false and PAYMENT_PROVIDER=disabled.

## Single-instance Docker deployment

1. Provision a server or managed container host supporting Node 22/Docker, TLS termination and a **persistent volume** mounted at /app/data. Do not deploy multiple replicas against the same SQLite file or use an ephemeral filesystem.
2. Build the existing Dockerfile: docker build -t legwork:release .
3. Configure environment secrets on the host, not in GitHub. At minimum: NODE_ENV=production, PORT=3000, DATABASE_PATH=/app/data/legwork.sqlite, SITE_ORIGIN=https://your-real-domain.example, SESSION_SECRET (32+ random characters), ADMIN_PASSWORD (new secret with 12+ characters), PAYMENT_PROVIDER=disabled, PUBLIC_INDEXING_ENABLED=false.
4. Expose the port only through the host's HTTPS reverse proxy. Set TRUST_PROXY_HOPS=1 only if the hosting provider guarantees exactly one trusted reverse proxy hop; otherwise leave 0.
5. Run a single instance with the persistent volume, e.g. docker run --env-file /secure/location/legwork.env -v legwork-data:/app/data -p 127.0.0.1:3000:3000 legwork:release. Do not publish port 3000 directly to the public internet.
6. Verify GET /health returns {"ok":true}. The Docker image includes a health check. Monitor HTTP errors, mail delivery and payment callbacks. Set up restart policies and alerting.
7. Take encrypted, access-controlled backups with SQLite's online backup API (not a naive copy of only the main file while WAL is active). Test a full restoration to a second database. Retain backups according to a documented privacy policy.
8. Configure a verified mail sender with SPF, DKIM and DMARC; confirm registration and password-reset emails in a real mailbox before allowing paid users.
9. Connect a real merchant account, correct UAH pricing, chargeback/refund handling and verified provider callbacks only after the merchant owner approves it. Never put those secrets in the repo or frontend.
10. Complete the legal, privacy, refund and cookie disclosures applicable to your audience, replace sample course and teacher materials with approved assets, and verify customer support contact details.
11. When the site is legally and editorially ready, set PUBLIC_INDEXING_ENABLED=true and redeploy. Submit https://your-real-domain.example/sitemap.xml to a search engine. Keep private authenticated routes noindex.
12. Perform a complete real-device test at 320, 375, 768 and 1280px, keyboard navigation, screen-reader labels, email delivery, a test purchase, order fulfillment, PDF certificate creation and backup restoration.

## SEO and accessibility

The server supports crawlable public routes /, /course, /shop and /mentorship. It serves a plain HTML heading and description before JavaScript loads, plus canonical URLs, OG metadata, robots directives and a four-page sitemap **only after release opt-in**. Everything private is excluded from the sitemap. Full SEO still needs clean internal links, media thumbnails/OG images, validated structured data, performance measurements, and reviewed Spanish URL strategy. Hash routes are still used for authenticated/student flows and internal navigation.

The interface includes a keyboard skip link, focus styles, a mobile menu with ARIA expanded state, a modal-like cart with an inert closed state, Escape-to-close and keyboard focus trapping. These improvements are not a substitute for manual VoiceOver, NVDA or TalkBack review.

## Security and operations

- Do not reuse an admin password shared in a chat. Rotate credentials and all existing compromised keys before public use.
- Do not commit .env, customer data, course video URLs or SQLite backups to Git.
- Store course video access on the server. YouTube embeds cannot provide DRM or prevent screen recording.
- The site requires HTTPS in production. Cookies use HttpOnly/SameSite protections and the app checks origin for state-changing requests.
- Payment integration is disabled without the real merchant configuration; never trust a browser return screen as payment confirmation.
- Consider a managed relational database and a dedicated mail worker before running several instances. The current SQLite and mail queue implementation is intended for a single container.
- Keep PUBLIC_INDEXING_ENABLED=false if privacy policies, checkout, approved public claims or legal pages are incomplete.
