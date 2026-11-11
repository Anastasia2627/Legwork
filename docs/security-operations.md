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
