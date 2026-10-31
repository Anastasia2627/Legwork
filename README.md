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
- Checkout is a *request for purchase*, not a live charge. Admin must verify payment externally and grant access. Never grant access from a frontend-only success state.
- Uploads are represented by external links for now; configure a private object-storage provider before allowing file uploads.
- The repository must remain free of credentials, payment secrets, real customer recordings and other private data.
- For production use HTTPS, backups, persistent disk, email provider, payment provider with webhook verification, and production security review.

## Features

- Public About, Legwork Lab, Classes catalog, Mentorship, registration and login.
- Direction shelves and filtered catalog (direction, level, type, teacher, equipment, focus, duration, hashtags); lesson detail; validated cart with atomic server-side order requests.
- Student dashboard, paid lesson access, self/Guru course plans, lesson progress, homework review, mentorship answers, streaks and badges.
- Admin dashboard with course/lesson creation and editing, pricing, enrollment approval, purchase request list, mentorship queue, Guru homework feedback, and marketing waitlist.
- Editable content in the admin dashboard; EN/ES navigation and core text.
- Semantic layout, responsive styling, lazy media placeholders.

## Missing inputs for production

Real lesson video URLs, visuals, finalized copy, mentorship pricing/turnaround, actual payment gateway, transactional email provider, full legal documents, and the exact Shopify promotion integration.

## Tests

```bash
npm test
```

Automated tests include integration checks for registration, session invalidation, student isolation, tier pricing, unauthorized video access, mentorship payment gating, homework feedback and atomic cart orders. They run with throwaway test credentials and a temporary SQLite database. See docs/architecture.md and docs/launch-checklist.md.
