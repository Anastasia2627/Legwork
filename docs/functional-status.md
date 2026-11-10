# Legwork: functional status and remaining release requirements

Verified against the application source and integration/browser tests. This is a feature inventory, **not** proof that a production merchant, mail provider or media host is configured.

| Feature | Code status | Live prerequisite / limitation |
| --- | --- | --- |
| Registration, login, password rotation and password reset | Implemented | Production registration/reset emails require verified SMTP and a valid HTTPS origin |
| EN/ES navigation and common interface copy | Implemented | Custom lessons, reviews, content edits and some UI messages are not automatically translated |
| About, course, shop, mentorship, student/admin dashboards | Implemented | Owner-approved media and final editorial copy still required |
| Course/lesson creation, pricing and teacher attributes | Implemented | Populate the actual lesson videos, course inventory and packages |
| Access checks, learning player, progress, homework links and Guru review | Implemented | Homework is an external HTTPS link; private binary upload/storage and DRM are not included |
| Admin-approved Guru certificates and verification links | Implemented | Owner must verify actual homework and approve certificates |
| Individual lessons, editable bundles and mixed cart | Implemented | Confirm real offer prices before launch |
| Self-service pending order cancellation | Implemented | Blocked once payment starts or approval is complete to avoid lost payments |
| Pending mentorship cancellation | Implemented | Only before staff marks payment verified |
| WayForPay hosted checkout, payment attempts, signed webhook and entitlements | Implemented, **disabled by default** | Requires merchant identity, merchant secrets, HTTPS production hosting, fixed USD→UAH rate and real provider test |
| Admin order approval | Implemented | Requires independent payment verification and now refuses approval when a WayForPay attempt is pending/requires review |
| Mentorship request, manual payment verification and private feedback | Implemented | Price, delivery deadline and actual payment must be agreed/verified manually |
| Transactional email queue, email verification and receipts | Implemented, **disabled without SMTP** | SMTP credentials, sender DNS records, session secret and server origin required |
| Newsletter, free-lesson and book signups | Implemented separately | Consent is saved, receipt sent when mail works, customer can unsubscribe through their email link; no bulk newsletter campaign composer |
| Free introductory lesson entry | Implemented | A student account is required to watch the free lesson; video must be supplied by the teacher |
| Home/course/shop/mentorship/account media URL library | Implemented | Admin can swap approved public HTTPS images/video links; no direct binary upload and no rights verification |
| Reviews/masterclass galleries | Interactive gallery implemented | Genuine, authorized review/gallery assets must be supplied; placeholders are not testimonials |
| SEO fallback metadata/robots/sitemap | Implemented for public routes | Hash routing/full SEO and structured data still limited, keep indexing disabled until final content |
| Refund/dispute processing, tax invoices | Not automated | Owner policy, accounting/provider integration required; existing cases are flagged for manual review |
| Shopify promotion and “3+1” discount | Not activated | Owner must confirm concrete offer rules, eligibility, stock, integration and dates |
| GDPR-style retention/deletion/export policies | Not fully implemented | Requires lawful retention policy, database/backups and payment-record handling approved before launching |
| Private native video/file uploads and malware scanning | Not implemented | Requires storage provider, access policy, quotas, security review and media hosting |
| Final legal pages and terms | Not supplied | Owner/legal reviewer must provide privacy, terms, refund policy and consent text |

## Where staff finish setup

- **Admin Studio → Public Media Library:** paste a public HTTPS URL, alt text and optional attribution. Leaving a slot blank preserves the placeholder. Lesson-specific images still live under Edit Full Lesson Details.
- **Admin Studio → Edit Courses / Edit Lessons / Lesson Bundles:** maintain actual prices and course inventory.
- **Admin Studio → Purchase requests / Mentorship reviews:** confirm external payments before granting access or giving paid feedback.
- **Admin Studio → Waitlist Signups:** see each consent separately; unsubscribed records are excluded.
- **Admin Studio → Email Delivery Health:** see whether SMTP is ready and whether queue entries have failed.

## Safety invariants

No browser redirect can grant purchased access. Provider payment status is validated server-side. A student can cancel only an unpaid order with no active payment attempt; admins cannot approve an order under reconciliation. An admin-editable image is intentionally **public**, so customer videos and private class recordings must never be inserted into media slots.

## Release gate

Before charging real clients: verify deployed SMTP flows and a real provider-supported test payment end-to-end, provide original licensed imagery and lesson video URLs, approve final course/package prices and legal documents, establish backup and privacy-retention procedures, and finish the outstanding integrations. Never treat a successful mock webhook test as live merchant approval.


## Additional working functionality

- Administrators can upload JPEG, PNG and WebP images directly into persistent local storage instead of manually hosting them. The server resizes, re-encodes and strips metadata. Only assigned files are publicly served; unassigned images expire after 48 hours.
- Students can download a JSON export of their own account data: profile, orders, progress, homework links, mentorship, certificates and marketing preferences. Other users' data and paid video URLs are excluded.
- Students may request account closure after password confirmation. Staff receive a queue of requests and can mark one under review. This is NOT automated deletion; legal and payment retention requirements need a documented process first.
