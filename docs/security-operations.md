# Legwork security activity and incident response

## What is recorded

The application stores a limited-retention record of successful or denied security-sensitive operations, including:
- Administrator enrollment and access changes, manual order approval and mentorship payment verification
- Administrative course, lesson, media, bundle, certificate and account-closure actions
- Successful sign-ins, failed sign-ins against known accounts, password changes, other-device session revocation
- Authenticated student attempts to use administrator write routes
- Only payment-provider callbacks that passed signature and transaction validation

Entries contain the event type, account ID when known, outcome, HTTP response status, timestamp, target ID and a small allowlist of nonsecret operation identifiers. They deliberately do **not** include raw request bodies, passwords, session cookies, payment card data, IP addresses, email contents, or private YouTube links.

Only authenticated administrators can retrieve the log. The Admin Studio shows recent activity. The paginated internal API is GET /api/admin/security-audit?limit=50&before=<event_id>; before is optional and limit must be 1–100.

## Retention and operational limitations

Audit entries are kept for SECURITY_AUDIT_RETENTION_DAYS (default 180, allowed range 30–730). Old entries are pruned on startup and approximately every 24 hours. Configure retention according to applicable law and the school's privacy policy.

These are **best-effort application records** saved in the same SQLite database. A server crash before a response finishes can omit an event; a database operator with direct write permissions can change it. This is not immutable or independently secured audit evidence. For incident-grade auditing, forward sanitized events to a separately controlled append-only service, restrict admin SSH/database access, and alert on repeated failures or unusual changes.

## Suggested incident response

1. If a student reports an unauthorized login, change their password and use Profile → Account Security to sign out other devices.
2. If manual access or payment status seems wrong, inspect Admin Studio → Security Activity, the order records and WayForPay's original transaction history. Never use the audit log alone as proof of payment.
3. Reconcile disputes/refunds and revoke purchases only under an agreed refund/chargeback policy.
4. Change compromised secrets using the hosting provider's secret manager, rotate credentials where possible, and invalidate affected sessions.
5. Preserve relevant records and backups in accordance with the incident response and privacy retention policy; avoid sharing personal data publicly.

## External dependencies

Real payments and SMTP delivery still require production credentials, verified hosting, policy approvals and end-to-end provider testing. YouTube videos remain link-accessible to viewers who can extract the URL from the player; website logging cannot stop screen recording.


## Access and purchase re-audit (11 November 2026)

| Operation | Guest | Signed-in student | Administrator |
| --- | --- | --- | --- |
| Browse active courses/lesson metadata | Allowed, without private video URLs | Allowed, without private video URLs | Allowed |
| Open free lesson | Login required | Allowed | Allowed |
| Open paid lesson or retrieve its YouTube URL | Rejected | Only if enrolled, bought individually or included in an owned bundle | Allowed for teaching |
| Submit progress/homework | Rejected | Only accessible lessons, own account | Allowed for accessible lessons |
| Create/cancel an unpaid order | Rejected | Own orders only; no free or already-owned lesson purchases | Admin routes used for payment review |
| Start WayForPay payment | Rejected | Only own, pending, currently available, not-yet-owned orders | Separate administrative workflows |
| Download account personal data / view another student's data | Rejected | Only own data | No general cross-account export endpoint |
| Admin enrollments, course edits, mentorship payment verification | Rejected | Rejected | Allowed and logged |
| Read security events | Rejected | Rejected | Allowed with pagination and no-store caching |
| Upload marketing/lesson-cover images | Rejected | Rejected | Allowed; publication is explicitly assigned |

The checkout and manual approval endpoints recheck current entitlement, preventing pending orders from being charged/approved when the lesson has since become free, inaccessible or already owned through a course. This does **not** automatically reconcile transactions already sent to WayForPay; those require payment-provider review if entitlement changes mid-payment.

Administrator sessions now expire after 12 hours, students after 7 days. Password-confirmation routes have additional request throttling. The site still limits each account to four current sessions. Unpublished local WebP images are no longer cached with an immutable one-year header; they use a short cache to reduce stale access after removal. This does not retract copies already downloaded by viewers.

### Residual risks and release blocks

- **High, operational:** The application still lets a trusted administrator manually grant entitlements and mark an offline order as paid. A signed provider callback or documented independent proof is needed in the school's operating procedure. The security log records who acted, not proof that money arrived. Do not use the manual approval buttons without checking the transaction outside Legwork.
- **High, hosting:** Administrator sign-in does not yet require multi-factor authentication. Enforce MFA on the hosting, email and YouTube owner accounts, minimize administrator access and adopt a supported admin MFA method before significant commercial sales.
- **Unavoidable with ordinary YouTube:** Any authorized viewer can inspect or share the video ID and record playback. The site can control access to its own lesson API but cannot impose DRM on YouTube.
- **Production verification pending:** Security checks in a temporary test server cannot confirm deployed reverse-proxy trust settings, real HTTPS, SMTP sender authentication, WayForPay settlement/refunds, persistent-volume backups, firewall rules or actual operational monitoring. These require review against the real hosting environment.

The in-repository tests are a defense-in-depth smoke suite, not an external penetration test. Before launch, run authenticated and unauthenticated API testing against a non-production deployment and perform independent review of payment flows and user data retention.
