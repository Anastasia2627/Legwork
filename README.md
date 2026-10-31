# LEGWORK — Svitlana Yurchak online school

Custom full-stack school website built from the supplied brief. English/Spanish storefront, student and admin dashboards, lesson catalog, progress, mentorship requests and manually managed enrollment.

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
- For production use HTTPS, backups, persistent disk, email provider, payment provider with webhook verification, and production security review.

## Features

- Public About, Legwork Lab, Classes catalog, Mentorship, registration and login.
- Direction shelves and filtered catalog (direction, level, type, teacher, equipment, focus, duration, hashtags); lesson and bundle detail; configurable multi-lesson bundles; validated mixed cart with atomic server-side orders.
- Student dashboard and a dedicated responsive course player: lesson syllabus, next/previous, private video playback, completion and homework links, instructor feedback, progress and achievement badges.
- Paid lesson access, self/Guru course plans, mentorship answers and streaks.
- Admin dashboard with course/lesson creation and editing, pricing, enrollment approval, purchase request list, mentorship queue, Guru homework feedback, and marketing waitlist.
- Editable content in the admin dashboard; EN/ES navigation and core text.
- Semantic layout, responsive styling, lazy media placeholders.

## Missing inputs for production

Real lesson video URLs, visuals, finalized copy, mentorship pricing/turnaround, real merchant enrollment/credentials for the integrated but disabled-by-default WayForPay checkout, transactional email provider, full legal documents, and the exact Shopify promotion integration.

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
