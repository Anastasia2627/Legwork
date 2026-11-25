# Legwork: functional status and remaining release requirements

Verified against the application source and integration/browser tests. This is a feature inventory, **not** proof that a production merchant, mail provider or media host is configured.

| Feature | Code status | Live prerequisite / limitation |
| --- | --- | --- |
| Registration, login, password rotation and password reset | Implemented | Production registration/reset emails require verified SMTP and a valid HTTPS origin |
| EN/ES navigation and common interface copy | Implemented | Custom lessons, reviews, content edits and some UI messages are not automatically translated |
| About, course, shop, mentorship, student/admin dashboards | Implemented | Owner-approved media and final editorial copy still required |
| Course/lesson creation, pricing and teacher attributes | Implemented | Populate the actual lesson videos, course inventory and packages |
| Access checks, learning player, progress, homework links and Guru review | Implemented | Homework is submitted by URL; lessons use validated YouTube URLs; screen capture, extracted URLs and DRM cannot be prevented with YouTube |
| Admin-approved Guru certificates and verification links | Implemented | Owner must verify actual homework and approve certificates |
| Individual lessons, editable bundles and mixed cart | Implemented | Confirm real offer prices before launch |
| Self-service pending order cancellation | Implemented | Blocked once payment starts or approval is complete to avoid lost payments |
| Pending mentorship cancellation | Implemented | Cancels linked order atomically; blocked during pending/reconciliation provider payments |
| WayForPay hosted checkout, payment attempts, signed webhook and entitlements | Implemented, **disabled by default** | Requires merchant identity, merchant secrets, HTTPS production hosting, fixed USD→UAH rate and real provider test |
| Admin order approval | Implemented | Requires independent payment verification and now refuses approval when a WayForPay attempt is pending/requires review |
| Mentorship Basic/Deep requests, owner-published prices, immutable quotes, manual/WayForPay confirmation and private feedback | Implemented, payments disabled by default | Owner must approve package price/deadline, merchant credentials, service terms, refund policy and live signed webhook |
| Transactional email queue, email verification and receipts | Implemented, **disabled without SMTP** | SMTP credentials, sender DNS records, session secret and server origin required |
| Newsletter, free-lesson and book signups | Implemented separately | Consent is saved, receipt sent when mail works, customer can unsubscribe through their email link; no bulk newsletter campaign composer |
| Free introductory lesson entry | Implemented | A student account is required to watch the free lesson; video must be supplied by the teacher |
| Home/course/shop/mentorship/account media URL library | Implemented | Admin can swap approved public HTTPS images/video links; no direct binary upload and no rights verification |
| Reviews/masterclass galleries | Interactive gallery implemented | Genuine, authorized review/gallery assets must be supplied; placeholders are not testimonials |
| SEO fallback metadata/robots/sitemap | Implemented for public routes | Hash routing/full SEO and structured data still limited, keep indexing disabled until final content |
| Refund/dispute processing, tax invoices | Not automated | Owner policy, accounting/provider integration required; existing cases are flagged for manual review |
| Shopify promotion and “3+1” discount | Not activated | Owner must confirm concrete offer rules, eligibility, stock, integration and dates |
| GDPR-style retention/deletion/export policies | Not fully implemented | Requires lawful retention policy, database/backups and payment-record handling approved before launching |
| Private video binary uploads and DRM | Not implemented by design | School uses YouTube links; paid player links remain extractable to authorized viewers, even with site access protection |
| Final legal pages and terms | Not supplied | Owner/legal reviewer must provide privacy, terms, refund policy and consent text |

## Where staff finish setup

- **Admin Studio → Public Media Library:** paste a public HTTPS URL, alt text and optional attribution. Leaving a slot blank preserves the placeholder. Lesson-specific images still live under Edit Full Lesson Details.
- **Admin Studio → Edit Courses / Edit Lessons / Lesson Bundles:** maintain actual prices and course inventory. Lesson creation and editing include a live, unsaved preview of the cover, title, duration, price and video-link status. Owners may upload a JPEG/PNG/WebP cover directly; the browser re-encodes it to WebP on Save. The preview does not upload images or play videos automatically. It does not verify YouTube availability or video rights.
- **Admin Studio → Lesson sequence:** editors are grouped by course and ordered by `sort_order` (with lesson ID as a tie-breaker). Staff can move a lesson earlier/later inside the same course, or set a validated sequence rank (0–1,000,000). Every move normalizes that course's ranks atomically, and updates the public catalog and authorized student syllabus without changing ownership, price or video access. The checklist counts missing assets but does not automatically certify a course for publication.
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

## YouTube links and account security

Lesson video URLs are accepted only from valid HTTPS YouTube addresses. Catalog pages do not disclose them; a student must have a signed-in session and proper entitlement to receive a paid video link from the learning API. A maximum of four sessions per account are retained; Profile includes the option to invalidate other devices after password confirmation. Login has a stricter rate limit. These changes **do not** stop an authorized person extracting the YouTube video ID or filming their screen. YouTube Unlisted links can be forwarded. Review YouTube's commercial and embed policies before charging students. See [YouTube security](youtube-security.md).


## Privileged activity monitoring

The app records an access-controlled, limited-retention activity trail for administrator changes, manual enrollment, payment approval, session revocation, relevant account operations, login successes and known-account failures, and provider callbacks accepted by the payment API. Staff see the latest events under Admin Studio → Security Activity; paginated results are also available to authorized admins. Event entries include only safe identifiers, result/status and allowlisted context — never raw request bodies, password fields, session cookies or private YouTube URLs. Default retention is 180 days (configurable from 30 to 730). This is a best-effort **application log**, not tamper-proof audit infrastructure or a substitute for production alerting and independent payment reconciliation. See [security operations](security-operations.md).


## Cloudflare operations (24 Nov 2026)

Cloudflare SQLite Durable Object PITR checkpoints can be recorded by a signed-in
administrator after re-entering their password. This covers SQL and stored
WebP images within the provider's up-to-30-day history; it is **not an
independent backup** and there is deliberately no public restore endpoint.
The mail outbox also supports admin-only retry of up to ten failed messages
once the SMTP or Resend sending configuration is corrected. Resend requests
carry stable per-event idempotency keys. Live provider delivery and an inbox
verification flow must still be tested by the owner before public registration.

## Course publication workflow

- New courses created through Admin Studio are drafts (`active=0`). Drafts and their lesson listings are excluded from public course/lesson APIs; ordinary learners cannot watch draft lessons, update progress, or add them to a published bundle.
- The administrator must save the course description, prices, and approve at least one lesson. Each approved lesson requires a syntactically valid YouTube URL and public cover URL before the explicit course Publish action is accepted. Unapproved lesson drafts remain hidden. The server checks these requirements again inside the publication transaction.
- Published courses can now be archived for sales and restored without revoking owned access. Individual lesson withdrawal remains outside this workflow. Legacy API callers that omit the explicit draft flag retain their previous creation behavior.
- The public Legwork Lab landing page remains specific to Legwork Lab. Other published courses receive generic data-driven pages; separate editorial landing pages are not required for basic sales.
- Publication checks URL format, not actual playback, file existence, licensing, legal approval, mail delivery, or real payment readiness. Do not treat publication as approval to charge customers.

## Independent lesson drafts

New lessons created through Admin Studio use the explicit draft flag and start with `published=0`. The additive SQLite migration defaults existing rows to 1, preserving previous public listings and student access. Legacy admin API callers that omit the draft flag retain their previous behavior.

Save the details, then choose Publish Lesson and confirm. The server validates the saved price, duration, YouTube URL and cover URL; these are format checks, not confirmation of licensing or playback. In a draft course this action approves a lesson for later course publication; an approved lesson in a published course becomes visible immediately. Unapproved lessons are excluded from public catalog responses, student syllabus, progress and certificate requirements, private materials, homework operations, and new lesson/bundle purchases. Admins can preview and attach materials to draft lessons.

Publication is one-way; already published lessons are not withdrawn. Publishing a new lesson expands the current syllabus and completion requirements for students who have not received a certificate. Existing issued certificates are not revoked; the existing certificate-lock policy remains unchanged. Reversible publication, versioned curricula and post-certificate assignment policies require a separate design.


## Course sales archive

- Course status uses the existing integer `active` column: 0 = draft, 1 = published/on sale, 2 = archived. Existing records are unchanged. Archive Sales and Restore Sales require an explicit administrator confirmation.
- Archiving removes the course, its individual lessons and related bundles from public sales APIs. New purchase requests and admin grants are rejected. Previously purchased full courses and individual/bundle lessons remain in the authenticated account library; playback, study notes, homework, progress and certificates retain their ownership checks. Free previews are no longer available to users without purchased/granted access.
- Pending course, lesson and bundle orders or unresolved provider attempts block archiving. Staff must reconcile these rather than silently cancelling or deleting purchases. Archiving and the pending-order check occur in one transaction. Signed paid callbacks are unchanged.
- Restore Sales reopens the previous offer and eligible active bundles; this does not revalidate media rights or payment configuration. Draft courses still require their ordinary publication checks. New lesson approval is blocked during archival; staff can save drafts. There is no permanent deletion or frozen curriculum snapshot.
- The private account dashboard returns archived lesson metadata only for the current student's entitlements and never includes video URLs. Course cards open the student's next lesson rather than a storefront page.


## Dynamic course pages

Published courses are automatically listed at `/#/courses`, with course-specific pages at `/#/course/<slug>`. Legwork Lab keeps its dedicated page at `/#/course`. Published course editors link directly to their public pages. Each generic page displays its own description, public lesson cover, ordered lesson program, duration, free preview (when available), Independent/Guru prices in USD, and checkout request for the actual course ID. The existing account/payment entitlement system remains authoritative. Draft and archived courses have no public purchase page. Lesson details link to the correct parent course.

Generic pages share existing course styles and EN/ES interface labels; custom course descriptions remain in their stored language. Per-course editorial sections, hero asset management and full server-rendered SEO are not implemented. Dynamic pages use hash routes; they are not added to the sitemap. Header navigation and the home course section now use the same published catalog.


## Dynamic course navigation

The header course dropdown, homepage course cards, course directory, footer and store entry links use the published catalog. Legwork Lab remains the flagship when available; otherwise the first published course is featured. With one course, primary calls to action open that course; with multiple or no courses, they open the course directory. Draft and archived courses are not advertised. Static Wave Lab / Split Lab coming-soon placeholders were removed rather than presenting archived courses as upcoming releases.

The admin publication, archive, restore and course edit actions refresh public catalog state and update navigation immediately in that browser. Other open sessions receive the new catalog on page reload; this is not a live push subscription. Menu controls use explicit click/keyboard state, and scrollable lists accommodate multiple courses on desktop and mobile.

## Bulk lesson editing

Admin Studio supports selecting up to 50 visible lessons, including across course groups. Filters deselect hidden rows; blank input fields leave saved data unchanged, while a price of 0 is an explicit price update. Editable batch fields are category, type, level, equipment, teacher, focus, tags and integer USD-cent price. Titles, ordering, media, free status, course ownership and student entitlements are excluded. A confirmation precedes the operation; unsaved individual edits should be saved first.

The protected bulk endpoint validates the entire selection and allowlisted changes, then performs metadata updates and optional draft publication in one database transaction. If any selected draft is incomplete or belongs to an archived course, none of the requested changes are saved. Existing approved lessons are not unpublished. Previously created order amounts are not rewritten. Changes and the selected count appear in the privileged activity audit (without raw request contents).

After a successful edit the public catalog and admin editor refresh, preserving the search and status filter but clearing selection. Publication checks saved media URL format only, not availability or rights. Integration and browser regression tests cover authorization, invalid input, all-or-nothing behavior, filtered selection, and zero-price edits.

## Account lifecycle hardening

Registration and recovery use the same email format checks; registration rejects non-string input and oversize names rather than truncating them. New user and initial verification token/outbox records are created in one database transaction when delivery is available. Locally suppressed mail does not invalidate an existing usable recovery link. The authenticated resend endpoint reports an unavailable address without disclosing suppression details to anonymous callers. Forgot-password continues to give a generic response for valid addresses.

Changing a password invalidates all sessions and outstanding password-reset tokens; existing email verification links remain usable. Resetting through a valid recovery token revokes all sessions and unused tokens. Profile changes preserve omitted optional fields and return normalized data. The browser clears private state on logout, credential changes or an expired session; stale account responses are ignored. The password-change form requires confirmation.

Account closure remains a password-confirmed, manually reviewed request, not automatic erasure: purchase records and course access are retained pending the school's approved retention/closure policy. Added an account lifecycle integration test using the local test outbox. Actual email delivery and production account flows remain release checks.
