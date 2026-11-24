# Operational status and incident triage

The signed-in administrator can open **OPERATIONS / INFRASTRUCTURE**.
`GET /api/admin/operations/status` is admin-only and sets
`Cache-Control: private, no-store`. It reports non-sensitive aggregate
counts for mail failures, queued messages, payment reconciliation,
outstanding account closure requests, image storage and Cloudflare PITR
bookmarks. It does not disclose user emails, password hashes, secrets,
card details, private videos or full logs.

The counts are **not** proof of successful email delivery, merchant
activation, backups or a live deployment.

Before commercial launch, separately arrange monitored alerts for:
- Worker runtime 5xx responses and unavailable `/health` / failing DO SQL
- repeated mail delivery failures, webhook errors and stale payments
- repeated authentication denials, administrative privilege changes
- high image storage usage and untested backup restores

Cloudflare observability is enabled in `wrangler.jsonc`, and LEGWORK has
a scoped admin security audit. Neither by itself guarantees notifications
to the operator. Configure notification destinations and retention in
Cloudflare before accepting real payments.

Keep `PAYMENT_PROVIDER=disabled` until merchant and bank reconciliation
are confirmed. A failed or stale payment may require manual reconciliation.
