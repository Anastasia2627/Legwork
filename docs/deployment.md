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

Node and Cloudflare share the public SEO model. Public paths are /, /courses, /course (flagship), /course/:slug for other published courses, /shop, /mentorship, and translated editorial routes /es, /es/course, /es/mentorship. The legacy /course/legwork-lab address redirects to /course. Unknown, draft and archived courses return 404; only published courses enter the sitemap. Each page has server-rendered headings, descriptions, public navigation links, canonical URL, Open Graph metadata and JSON-LD (Course or WebPage/WebSite). Reciprocal hreflang links are emitted only for the three editorial pages with stored English and Spanish copy. Dynamic course descriptions currently have no per-language data, so they have no invented translated URLs. Direct public pages use crawlable links while legacy hash navigation remains supported, including private student routes. No private video URL, customer data, order, account or draft content is included in public metadata.

Indexing is deliberately disabled in both Wrangler environments. Before enabling, verify the real approved domain and public content, configure SITE_ORIGIN as the exact HTTPS origin, set PUBLIC_INDEXING_ENABLED=true **only in production**, redeploy, and confirm robots.txt, sitemap.xml, canonical URLs, public-page 200/404 status, and noindex on private pages. Staging and unmatched origins stay noindex. A metadata service failure never makes an unverified page indexable. Submit the production sitemap to Search Console after launch; validate structured data and approved share images separately. Course schema is descriptive, not a promise of Google rich results. Full browser, deployed endpoint and crawler validation remain outstanding.

The interface includes a keyboard skip link, focus styles, a mobile menu with ARIA expanded state, a modal-like cart with an inert closed state, Escape-to-close and keyboard focus trapping. These improvements are not a substitute for manual VoiceOver, NVDA or TalkBack review.

## Security and operations

- Do not reuse an admin password shared in a chat. Rotate credentials and all existing compromised keys before public use.
- Do not commit .env, customer data, course video URLs or SQLite backups to Git.
- Store course video access on the server. YouTube embeds cannot provide DRM or prevent screen recording.
- The site requires HTTPS in production. Cookies use HttpOnly/SameSite protections and the app checks origin for state-changing requests.
- Payment integration is disabled without the real merchant configuration; never trust a browser return screen as payment confirmation.
- Consider a managed relational database and a dedicated mail worker before running several instances. The current SQLite and mail queue implementation is intended for a single container.
- Keep PUBLIC_INDEXING_ENABLED=false if privacy policies, checkout, approved public claims or legal pages are incomplete.


## Public image uploads and backup

The native image uploader stores files under a public-media subdirectory beside the SQLite database by default. MEDIA_UPLOAD_DIR may override this, but must point to secure persistent storage. Keep the directory out of public static serving, source control and ephemeral containers. Back up both database and stored WebP files and test restoring a referenced image. Administrators remain responsible for copyright and privacy permissions. Only images assigned to public media or lesson covers are served. Unassigned files are removed after 48 hours.

Public image uploads are not private lesson video hosting, homework uploads, or a DRM system.

## Cloudflare independent backup and recovery drill

The owner CLI produces an encrypted portable archive of SQL tables, including orders, enrollments, progress, certificate records and private attachment contents, plus the uploaded public WebP image registry and bytes. Remote YouTube videos and external media are links only: back up the original source files separately. Deployment secrets, hosting configuration and external provider records need separate secure retention.

1. Before significant imports or updates, record a recovery bookmark through Admin Studio. Cloudflare's point-in-time history is limited to 30 days and is not an independent backup.
2. Choose a maintenance window with no student activity, content edits, scheduled jobs or payment updates. Do not interrupt payment reconciliation or silently discard a pending payment. The CLI does not impose a maintenance lock.
3. From a trusted computer with the repository and Node 22 dependencies installed, run `npm run backup:cloudflare -- https://YOUR-CONFIGURED-ORIGIN ./backups/legwork-YYYY-MM-DD.legwork-backup`. Enter administrator credentials, MFA if configured, and a separate strong encryption passphrase only at the interactive prompts. Never put credentials in a shell argument, chat, Git, or an environment file committed to the repository.
4. The exporter verifies per-page SHA-256 digests against a second server pass and compares beginning/end manifests. If a table changes, a media asset is missing, or the 20-minute export token expires, the export fails rather than retaining an unchecked archive. This is a consistency check, not an atomic database snapshot: changes between checks can still escape detection.
5. Verify again using `npm run backup:verify -- ./backups/legwork-YYYY-MM-DD.legwork-backup`. The verifier authenticates/decrypts the archive, reconstructs a disposable local SQLite database, checks table counts, foreign keys, integrity, public-image references and private-file hashes. Use only a trusted LEGWORK archive and an encrypted, trusted local drive; temporary plaintext is removed but not securely erased. An archive containing account hashes and private files remains sensitive even when encrypted.
6. Keep an independently accessible encrypted copy outside Cloudflare and retain its passphrase in a separate password manager or other approved secret store. Agree on retention and deletion policy. Start with a weekly manual backup and another before important changes; no automated offsite job has been configured.
7. For a restoration incident, first preserve a fresh independent export and payment/provider evidence, stop traffic and mail delivery, and choose a recovery point under operator approval. Reconcile external payments, certificate issuance, pending mail, and account changes made after that point. Invalidate old sessions/reset links and rotate affected credentials before reopening. Test the restore in an isolated environment with payments, public registration, email delivery and search indexing disabled. Never upload real customer data to Git or a public staging environment.
8. A successful offline verification is not a live Cloudflare restoration test. There is no destructive restore endpoint. A production recovery requires explicit operator approval and the platform's supported point-in-time procedure; a portable archive is an independent recovery source, not a one-click Durable Object import.

Record the backup timestamp, environment, verification result and operator in a private operations record; do not record passwords, recovery bookmark contents or customer details. Actual offsite backup creation and restoration have not been confirmed.
