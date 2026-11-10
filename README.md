# LEGWORK — Svitlana Yurchak online school

Custom full-stack school website built from the supplied brief. English/Spanish storefront, student and admin dashboards, lesson catalog, progress, mentorship requests and payment-controlled enrollment. See [current functional status](docs/functional-status.md) for implemented features and release prerequisites.

## Start

Requires Node.js 22 (recommended).

```bash
npm install
cp .env.example .env
# Set ADMIN_PASSWORD to a strong **new** secret and SESSION_SECRET to random 32+ bytes.
npm start
```

Open http://localhost:3000. A SQLite database is created at `data/legwork.sqlite`.

## Security

- Admin username is `Admin`. Admin password is **never shipped in this repository**. Set it as `ADMIN_PASSWORD` in the deployment environment. Change any password that has been shared in a chat before production.
- Sessions are HMAC-bound to a server secret, stored hashed in SQLite, and sent as HttpOnly SameSite=Lax cookies (Secure in production). Authentication has rate limits and passwords use scrypt. Password changes revoke old sessions.
- Course video URLs are returned only by authorized API endpoints. **YouTube video IDs/URLs cannot be hidden from a legitimate browser viewer and screen capture cannot be reliably prevented.** For professional DRM use a licensed DRM-capable streaming service, not YouTube.
- Checkout defaults to manual purchase requests until a verified WayForPay merchant is configured. Optional signed hosted checkout grants access only after a server-verified provider callback; never from a browser return page. See docs/payments.md.
- Uploads are represented by external links for now; configure a private object-storage provider before allowing file uploads.
- The repository must remain free of credentials, payment secrets, real customer recordings and other private data.
- For production use HTTPS, backups, persistent disk, configured SMTP provider, payment provider with webhook verification, and production security review.

## Features

- Public About, Legwork Lab, Classes catalog, Mentorship, registration and login.
- Direction shelves and filtered catalog (direction, level, type, teacher, equipment, focus, duration, hashtags); lesson and bundle detail; configurable multi-lesson bundles; validated mixed cart with atomic server-side orders.
- Email verification, password recovery via single-use links, encrypted retryable transactional email queue (SMTP configured separately).
- Student dashboard and a dedicated responsive course player: lesson syllabus, next/previous, private video playback, completion and homework links, instructor feedback, progress and achievement badges.
- Paid lesson access, self/Guru course plans, mentorship answers and streaks.
- Admin dashboard with course/lesson creation and editing, pricing, enrollment approval, purchase request list, mentorship queue, Guru homework feedback, and marketing waitlist.
- Editable content and public media URL slots in Admin Studio (Home, course, shop bundle, mentorship, student course cards); EN/ES navigation and core text.
- Separate newsletter/free lesson/book mailing preferences, opt-in receipts and tokenized unsubscribe links when email delivery is enabled.
- Cancellation of unpaid customer orders and pending mentorship requests, with server-side safeguards against cancelling active payment attempts.
- Semantic layout, responsive modular styling, real-media preview sourcing and admin-editable lesson cover images.

## Missing inputs for production

Real lesson video URLs, owner-approved visuals, finalized copy, mentorship pricing/turnaround, merchant credentials for the integrated but disabled-by-default WayForPay checkout, transactional email provider, full legal documents and confirmed Shopify promotion terms. Public media URLs are editable in the admin; file uploads, direct refund automation and bulk newsletter campaigns are not included.

## Tests

```bash
npm test
```

Automated tests include integration checks for registration, session invalidation, student isolation, tier pricing, unauthorized video access, mentorship payment gating, homework feedback and atomic cart orders. They run with throwaway test credentials and a temporary SQLite database. See docs/architecture.md and docs/launch-checklist.md.

## Browser checks

Run `npm run test:e2e` after `npx playwright install chromium`. Tests start a separate local server with disposable test-only credentials and exercise the full student journey on desktop and mobile Chromium. They do not use production accounts.

Private video URLs are only returned by `/api/learning/:id` after authorization; no purchased video URL is included in `/api/lessons` or the rest of the syllabus.

## Lesson bundles

An administrator can create a bundle containing 2–30 lessons, set its discounted/current and original prices, publish it or hide it. Shoppers can combine bundles with non-overlapping individual lessons in one cart. The server calculates totals, checks availability and does not grant access until the order is manually verified. After a bundle has been sold, its included lessons cannot be changed: create a new bundle version.

## Payment operations

The repository includes a WayForPay hosted payment form, a signed callback receiver, a payment-attempt ledger and automatic enrollment/lesson/bundle unlocking after an authenticated `Approved` callback. Payments are disabled until a legitimate merchant configures its own credentials, public HTTPS origin and approved UAH conversion rate. No real purchases or provider sandbox payments have been made. For required activation steps and restrictions, read [docs/payments.md](docs/payments.md).

Customer payment history includes the signed-attempt status and a continue button for pending WayForPay invoices. A resumed invoice reuses its original reference and amount, not a new charge request.

## Verified certificates

Guru students can download PDF certificates only after completing every course lesson, submitting homework, and receiving explicit instructor approval on each assignment. The school administrator must issue each certificate. Certificates contain a unique verification reference and can be revoked; revocation disables the download. See [docs/certificates.md](docs/certificates.md). Certificates attest course completion, not professional accreditation.

## Bilingual page editor

Administrators can update the main hero heading, section label, intro, call-to-action, browser title and meta description on the home, course and mentorship pages. English and Spanish content are stored separately in SQLite. All changes are plain-text only, escaped in the client, protected by admin authentication and optimistic revision checks. These controls **do not yet translate all other site content**. See [docs/editorial-content.md](docs/editorial-content.md).

## English / Spanish interface

The navigation, storefront, filters, student classroom, account, payments, certificates, administration controls and common API messages have EN/ES translations. Switching language preserves option values, order IDs and prices. English remains the canonical stored language. Custom course text, student feedback and user content are not translated automatically and need approved Spanish versions for a fully bilingual launch. See docs/localization.md.

## Release readiness and accessibility

Public routes /, /course, /shop and /mentorship have server-rendered fallback metadata, but indexing is disabled until PUBLIC_INDEXING_ENABLED=true on a public HTTPS production host. robots.txt disallows crawlers and sitemap.xml stays unavailable before launch. Keyboard navigation, accessible cart state and responsive layout tests cover small mobile widths. Read [docs/deployment.md](docs/deployment.md) before deploying; real payment and mail services are not configured in the repository.

## Frontend ownership and photography

See [Frontend architecture](docs/frontend-architecture.md) for the CSS ownership map, image editing, safety notes and test checklist. The page styles now live in `public/css/core.css`, `public/css/components.css` and `public/css/pages/`. Legacy `public/styles.css` remains only for pre-existing features; don't add new design overrides there. Two credited editorial photos are used only as development previews until owner-approved original media is supplied. Admins can edit fixed public media slots through **Admin Studio → Public Media Library** and set each lesson's public HTTPS `cover_url` separately. This is URL management, not binary uploading.
