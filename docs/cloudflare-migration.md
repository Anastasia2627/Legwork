# LEGWORK — Cloudflare Workers migration (staging candidate)

**Status: a Cloudflare Worker bundle was successfully deployed on 22 Nov 2026, but the complete school has not been verified as production-ready. Latest changes still require a successful redeploy and smoke tests.**
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
- **No-card image storage:** uploaded public artwork and lesson covers use the
  synchronous key-value storage inside the existing SQLite-backed Durable Object
  `SCHOOL`. No R2 subscription, Images binding or external storage is needed.
  The browser re-encodes JPEG/PNG/WebP to metadata-free WebP (max 2 MB). Only
  admin-assigned images can be served through `/media/:name`.
  Upload quota is deliberately capped at **100 MB per school** (far below
  the free storage ceiling). Unassigned images older than 48 hours are cleaned
  up when another image is uploaded.
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
budget. Test under genuine conditions before considering production. Daily request
limits alone do **not** prove commercial readiness. Durable Object storage shares
the Workers Free tier account limits: do not enable any paid resource or bind a
billing method without separate approval. If CPU use exceeds Free, reconsider
the backend platform instead of weakening the password hashing.

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

## Cloudflare startup bug: iconv-lite stream shim (10021)

When Wrangler prints `Uncaught TypeError: require_streams(...) is not a function`
from `iconv-lite/lib/index.js`, the bundle selected a browser-only stub for
the Node.js stream helper. This is a known Workers SDK issue with newer
`process.versions.node` support; it is **not** a Durable Object database error.

`npm run build` now calls `scripts/patch-iconv-cloudflare.mjs` before
generating the Worker source. The patch applies **only in installed
`node_modules/iconv-lite/package.json` manifests** (including nested copies)
and removes their `false` browser maps for Node streams; it does not edit
the tracked backend, payment logic or Git history. The patch is idempotent
and has an offline regression test.

To avoid accidentally publishing an unpatched bundle, keep the Cloudflare
dashboard Build command set to **`npm run build`** and Deploy command
to **`npx wrangler deploy`**. `npm run cloudflare:deploy` also performs
the patch as part of its build.

Reference: https://github.com/cloudflare/workers-sdk/issues/9309

## Cloudflare Workers Builds GitHub integration (required)

**Workers Builds does not execute the Wrangler custom `build.command` field.**
Set the build command in the Worker dashboard; do not leave it blank.

Open `Workers & Pages → legwork-school → Settings → Build` and configure:

| Field | Value |
| --- | --- |
| Connected repository | `Anastasia2627/Legwork` |
| Production branch | `main` |
| Root directory | `/` (repository root) |
| **Build command** | `npm run build` |
| **Deploy command** | `npx wrangler deploy` |

The `npm run build` command runs `scripts/build-cloudflare.mjs` and
generates `cloudflare/generated/app.js` that is intentionally absent
from Git. A bare `npx wrangler deploy` without this build command causes
`Could not resolve "./generated/app.js"`.

If you prefer a single Deploy command instead, use
`npm run cloudflare:deploy` (includes the generator).
Do not set both the Build command and `cloudflare:deploy`
unless intentionally repeating the generator.

After saving, retry the latest build or push a new commit to `main`.
A build may reveal additional Cloudflare binding/runtime issues: this is
not confirmation of production readiness.

Source: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

## Cloudflare account setup

1. Sign in to https://dash.cloudflare.com/ and enable Workers Free.
2. **Do not activate R2, Images billing or enter payment details.**
   `wrangler.jsonc` deliberately has **no** `r2_buckets` or `images` binding.
   No bucket or account upgrade is required for the test deployment.
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

   **This repository is connected to Cloudflare via the user's dashboard, but
   successful deployment is not yet verified.** Never interpret a dry-run as
   a live deployment.

## If the published site looks empty or says Connection error

The previous browser bootstrap ran six requests through `Promise.all`; a single
failed API request could hide the entire public site. The restored frontend uses
`Promise.allSettled` and read-only editorial fallback defaults. This preserves
the public pages without pretending that accounts or purchases are working.

To diagnose the backend, visit
`https://legwork-school.vlasiuk-anastasiia15.workers.dev/health`.
A working API returns `{"ok":true}`. If it returns HTTP 503, open
**Workers & Pages → legwork-school → Settings → Variables and Secrets**
and set the following values for this Worker only:

- `SESSION_SECRET`: secret; locally run `openssl rand -hex 32` and paste
  its output into the Cloudflare secret field (never into chat or GitHub).
- `ADMIN_PASSWORD`: secret; a new strong unique password with at least 12
  characters, stored in a password manager.
- `SITE_ORIGIN`: `https://legwork-school.vlasiuk-anastasiia15.workers.dev`
  without a trailing slash. This is not sensitive; a regular variable is fine.

Save and check `/health`, `/api/courses`, `/api/lessons`, `/api/content`,
and `/api/media`. Only a successful deploy and healthy endpoints demonstrate
that public school data is loading.

**Production registration is intentionally disabled without a working
email sender.** To use Resend, verify an approved sending domain and configure
`RESEND_API_KEY` and `MAIL_FROM`. Do not enable live sales until verification,
password resets, payment callbacks and permissions pass testing.

The Cloudflare Durable Object uses a new persistent database; old real accounts,
orders, images and progress are **not** imported automatically. Verify backup,
reconciliation and restoration before migrating any existing users.

The homepage displays only approved gallery/review assets. No fake testimonials
or empty placeholders are published.
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
- Images stored as small WebP values share the Durable Object's SQLite storage
  and are not intended for videos, large files or unlimited uploads.
  Only client-side re-encoding is implemented; server validates WebP structure
  and refuses metadata/animation, but does not fully decode the image.
- Review the platform terms for paywalled YouTube embeds. YouTube Unlisted IDs and
  screen recordings cannot be hidden from authorized viewers.
- External email sending, paid payment callbacks and production PDF generation
  require real Cloudflare tests; a successful static build is not enough.
- `PUBLIC_INDEXING_ENABLED` stays off until approved editorial/legal content.
- Old unassigned media is removed after 48 hours when a new image is uploaded.
  This is lazy cleanup, not scheduled deletion; establish ongoing backup and
  cleanup procedures before real customers use the school.
- Use distinct staging and production storage before inviting real customers.

Official references:
- https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#synchronous-kv-api
