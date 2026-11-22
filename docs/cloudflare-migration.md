# LEGWORK — Cloudflare Workers migration (staging candidate)

**Status: CODE PREPARED, NOT DEPLOYED, NOT VERIFIED IN A CLOUDFLARE ACCOUNT.**
Do not switch the domain or accept real payments until the checks below pass.
The existing `npm start` Node.js + SQLite deployment remains unchanged.

## Architecture

- **Cloudflare Workers Static Assets:** `public/`, including the premium editorial frontend.
- **Worker:** SEO fallback, health routing, security headers, and private API forwarding.
- **SQLite-backed Durable Object `SCHOOL`:** a single persistent relational database,
  accessed synchronously through `cloudflare/sqlite-adapter.js`. This was selected instead
  of D1 because LEGWORK uses many **synchronous** better-sqlite3 prepared statements and
  multi-statement transaction callbacks. D1 is asynchronous; changing everything at once
  would risk ownership checks, paid orders and idempotent payment callbacks.
- **R2 `MEDIA`:** private bucket for assigned lesson cover / public marketing WebP files.
  `IMAGES` binding decodes and recompresses uploads to WebP. R2 never publicly exposes
  object URLs and the app checks references in the database before serving media.
- **Email:** the same token/verification/outbox routes, with Resend's HTTPS API replacing
  long-lived SMTP TCP connections and timers. Requires independently configured sender,
  `RESEND_API_KEY` and `MAIL_FROM`. If absent, public registration correctly fails closed.
- **Certificates:** the existing PDFKit format and issuance checks, with bundled Noto Sans
  font bytes in place of filesystem font loading.
- **Payments:** existing signed WayForPay callback logic retained; merchant remains
  **disabled by default**. No live payment has been exercised on Cloudflare.

### Why not blindly use the Workers Free plan?

Free Workers have a 10 ms CPU-time budget per invocation (as of Nov 2026).
LEGWORK uses scrypt password verification and PDF rendering; either may exceed that
budget. Test under genuine conditions before choosing Free or Paid. Daily request
limits alone do **not** prove commercial readiness. Durable Object/R2/Images quotas
and prices are separate. If CPU tests exceed Free, budget for Workers Paid or
reconsider the backend platform instead of weakening the password hashing.

## Local preparation

Requires Node 22+.

```bash
npm install
npm test
npm run cloudflare:check     # Generate Worker code + local Wrangler build (no deploy)
npm run cloudflare:dev       # Local worker/dev preview; use disposable test secrets
```

The source-of-truth server is `server.js`. `scripts/build-cloudflare.mjs` extracts
Cloudflare-specific routes, email and certificate code from it on each build.
Generated source under `cloudflare/generated/` is intentionally gitignored.
If the Node backend changes in ways the generator cannot safely recognize,
generation fails instead of silently dropping routes. Keep the native Node tests.

## Cloudflare account setup

1. Sign in to https://dash.cloudflare.com/ and enable Workers.
2. Create R2 buckets (names in `wrangler.jsonc`) when using the remote environment:

   ```bash
   npx wrangler login
   npx wrangler r2 bucket create legwork-public-media
   npx wrangler r2 bucket create legwork-public-media-preview
   ```

3. `wrangler.jsonc` defines the single `LegworkStore` SQLite Durable Object
   migration. It is not D1: do **not** create a D1 database or assume a D1 import
   command can restore its storage.
4. Configure private secrets in Cloudflare (never in git, screenshots or chat):

   ```bash
   npx wrangler secret put SESSION_SECRET     # random 32+ characters
   npx wrangler secret put ADMIN_PASSWORD     # fresh 12+ character admin password
   npx wrangler secret put SITE_ORIGIN        # exact https://your-domain
   ```

   Optionally, after verifying a real email domain / sender:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put MAIL_FROM
   ```

5. Keep `PAYMENT_PROVIDER=disabled` and `PUBLIC_INDEXING_ENABLED=false`.
   These defaults are set in `wrangler.jsonc`.
6. Run `npm run cloudflare:check` and inspect the result. Then run
   `npm run cloudflare:deploy` only when the build and local smoke tests succeed.

   **This repository has not been connected to your Cloudflare account.**
   There is no deployed URL yet. Never interpret a dry-run as a live deployment.

## Required end-to-end acceptance checks

1. `/health` returns `{"ok":true}`. Public pages load all CSS/JS.
2. Register with working Resend domain. Verification and password reset emails
   reach real inboxes, use single-use tokens, and expire correctly.
3. Log in/out, revoke sessions, change password, and confirm an account cannot
   read another student's private dashboard or homework.
4. Public lesson catalog does not include private YouTube URLs. Unauthenticated or
   unpaid users receive 401/403 at paid video endpoints.
5. Purchase requests, bundles, duplicate orders and tier upgrades preserve the
   original checks. Approved payment grants access only after verified server
   callback; no browser redirect can grant access.
6. Simulate callback retries and replays against isolated test data; must be
   idempotent. Test real WayForPay callback only after merchant approval.
7. Upload a JPEG/PNG through Admin Studio; verify the returned object is WebP,
   unassigned files return 404, and assigning/unassigning a slot changes access.
8. Complete Guru homework, teacher approval, certificate issuance, download,
   verification and revocation. Verify names using Cyrillic characters.
9. Restart/redeploy Worker and confirm all user, order, progress and image data
   persist. Confirm backup/restoration procedure independently.
10. Run mobile browser tests and Workers CPU usage, memory and error monitoring.
    Verify 10ms Free CPU limit is not reached before promising free hosting.

## Migration of existing data (BLOCKER if data is already live)

Creating a SQLite Durable Object creates a **new, empty database**. The existing
`data/legwork.sqlite` file is **not automatically moved**. If there are any
real student records, orders, certificates or uploaded images:
- Take a consistent offline SQLite backup and preserve the uploaded media directory.
- Plan a private, authenticated, one-time import with table/foreign key order,
  row-count reconciliation and checksums. Do not send a user database in chat.
- Reconcile all open payment attempts and sessions; old session cookies should be
  explicitly invalidated or migrated.
- Test restoration and compare counts before changing DNS.

This first implementation intentionally does **not** include a public database
import endpoint, because exposing one before a real data inventory would be unsafe.

## Operational notes and remaining risks

- The central Durable Object is intentionally single-instance for the school's
  low traffic; it is not a horizontal multi-region SQL architecture.
- Image transformation costs and R2/DO operations depend on live usage.
- Review the platform terms for paywalled YouTube embeds. YouTube Unlisted IDs and
  screen recordings cannot be hidden from authorized viewers.
- External email sending, paid payment callbacks and production PDF generation
  require real Cloudflare tests; a successful static build is not enough.
- `PUBLIC_INDEXING_ENABLED` stays off until approved editorial/legal content.
- Unreferenced uploads in R2 currently need a lifecycle cleanup policy; do not
  assume filesystem cleanup timers from the original server still run.
- Use distinct staging and production storage before inviting real customers.

Official references:
- https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/images/optimization/binding/
- https://developers.cloudflare.com/r2/get-started/
