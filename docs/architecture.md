# Architecture & security boundary (development)

## Runtime
- Node.js 22 / Express 4; better-sqlite3 SQLite with foreign keys and WAL
- Vanilla JavaScript client and responsive CSS
- Server-side admin authorization; Dockerfile for preview packaging

## Data model
users, sessions, courses, lessons, orders, enrollments, lesson_access, progress, mentorships, homework_reviews, activity, email_waitlist.

The extra-routes module applies additive, idempotent schema upgrades. Never delete customer databases to migrate.

## Security workflow
1. Passwords are scrypt hashed; opaque session tokens are SHA-256 hashed before storage.
2. Admin login uses username Admin and a unique server-only password (seeded once, then rotated from account settings).
3. Lesson playback checks session and owned course or lesson. Free lessons also require an account. YouTube video identifiers cannot be concealed after playback.
4. Purchases produce pending orders with prices fetched from the database, including distinct Guru pricing. An admin can approve only after independent payment verification.
5. Guru homework reviews exist only for enrolled Guru students; student reads are ownership scoped.
6. Cross-site origin checks, rate limits, restrictive content security policy and HttpOnly session cookies protect common attack paths.
7. Changing a password revokes prior sessions.

## Open work before commercial launch
- Real payment processor with cryptographically verified and idempotent webhooks
- Transactional emails and secure account recovery
- DRM-capable video hosting if strict content protection is required
- Original media, accurate course content, legal terms and returns policy
- Full English/Spanish translations, indexable server-rendered SEO/structured data, browser E2E test suite
- Private homework uploads and malware scanning, secure data deletion and retention
- Final certificate PDF issuance and approved assignments
- Shopify voucher integration, shop discounts and promotions

## Quality checks
Run npm test to verify the authorization, price integrity, course tiers, video access, student isolation, reviews, hostile-origin rejection and password rotation. Run npm start for browser UI testing.

This is not a payment-ready commercial platform yet.
