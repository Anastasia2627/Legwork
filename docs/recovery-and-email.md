# LEGWORK — Cloudflare recovery and Resend delivery

## Current state and non-negotiable safety

The website stores accounts, progress, orders, certificates, editorial content
and uploaded WebP images in **one SQLite-backed Cloudflare Durable Object**
named `SCHOOL`. Do not use `wrangler d1 export`: this is **not D1**.
Never treat a GitHub build, a saved recovery bookmark or email credentials as
proof of a working production website.

### Cloudflare recovery points (available only on the deployed Worker)

Cloudflare's built-in point-in-time recovery (PITR) retains SQLite SQL **and KV
image storage** for **up to 30 days**. This is a provider-maintained recovery
history, **not** a downloaded, offsite or long-term backup.

In the LEGWORK admin panel, open **Database Recovery Points**:
1. Record a checkpoint before bulk edits, a large lesson import or a release.
   The administrator must re-enter their own password. Labels, creator, time
   and expiration are stored in `recovery_checkpoints`.
2. Review checkpoint age (the interface treats 29+ days as unsafe to account
   for retention-edge uncertainty). Checkpoints cannot extend the provider's
   30-day recovery window.
3. Recovery bookmarks are not exposed in list views. An authorized operator
   can reveal an individual bookmark using
   `POST /api/admin/recovery/checkpoints/:id/reveal` with the administrator
   password, over HTTPS, when preparing a reviewed recovery. Do not share or
   print bookmarks casually.
4. No public website route performs a restore. A rollback can erase **newer
   purchases, lesson progress, access grants, admin changes and uploaded media**.

**Emergency recovery approval procedure** (must be tested on disposable
Cloudflare staging before use on production):

- Pause school writes and charging; reconcile paid or pending transactions
  independently before choosing a target. Export or preserve any
  post-bookmark information required for reconciliation.
- Record a **current** pre-restore bookmark outside the database so the
  rollback itself can be undone. Independently inventory current accounts,
  orders, payment events and uploaded images without exposing PII publicly.
- With explicitly approved, temporary operator-only Worker code, call
  `ctx.storage.onNextSessionRestoreBookmark(reviewedBookmark)`, save the
  returned **undo bookmark** outside the database, then `ctx.abort()` to
  apply the restore on the next Durable Object session. Do **not** publish a
  public HTTP endpoint for these calls. These Cloudflare APIs are unavailable
  in local Wrangler development.
- Rotate `SESSION_SECRET` to invalidate all former browser sessions, verify
  the restored dataset and cross-check payment records before resuming sales.
  Verify image access, entitlements, user isolation and webhook processing.
- Remove the temporary recovery-only code, and run the full smoke and E2E
  suite before reopening the school. Keep your approved incident log private.

Independent encrypted SQL/KV export and offline verification tooling now exists
(`docs/portable-backup.md`). This is **manual**, not an automatically scheduled
or production-verified backup. It must still be run from the owner's private computer.

Official API: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api

## Email sender: Resend + Cloudflare (without adding billing)

The **public website** may remain on `workers.dev`, but the email sender
must use a domain or subdomain you control and verify in Resend; the
`workers.dev` hostname is not your own verified sender domain.

1. Set up a sender in Resend and verify its DNS records (SPF/DKIM as required)
   before any live school registrations.
2. In **Cloudflare → Workers & Pages → legwork-school → Settings →
   Variables and Secrets**, save `RESEND_API_KEY` as a **secret** and
   `MAIL_FROM` as the matching verified sender, e.g.
   `LEGWORK <hello@your-real-domain.example>`.
3. Ensure `SITE_ORIGIN` is the exact deployed HTTPS origin and
   `SESSION_SECRET` / `ADMIN_PASSWORD` are secure. Never put values of
   these secrets in GitHub or screenshots. Keep `PAYMENT_PROVIDER=disabled`.
4. Redeploy using **Build: `npm run build`** and **Deploy:
   `npx wrangler deploy`**. Check `/health` and `/api/email/config`.
   `enabled:true` only means configuration is present, not that your real
   mailbox or domain is verified.
5. Create a disposable student account using **a real inbox you own**.
   Confirm that its 24-hour email verification link arrives, can be used
   once and allows the account to make purchase requests. Test a password
   reset (30-minute expiry and one-time use), the old session becoming
   invalid, and a second login with the changed password.
6. In Admin Studio → **Email Delivery Health**, review accepted, pending
   and failed outbox counts. If the sender configuration was broken, fix it
   first, then use **Retry up to 10 failed emails**. Failed emails are
   encrypted in storage and the API returns only aggregate counts.
   The Resend request carries a stable `Idempotency-Key` per outbox event
   (provider deduplication window is 24 hours); older manually retried
   messages may still need independent reconciliation.
7. Check the real mailbox and Resend delivery logs. Neither a `200` from
   the mail API nor an outbox entry marked `sent` proves inbox delivery.

The repository's automated tests exercise token validation, resend limits,
password rotation, permission checks, provider-HTTP request construction
and retry authorization with mocks. **They do not send a real production email**.

Official docs:
- https://resend.com/docs
- https://resend.com/changelog/idempotency-keys
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/


## Resend delivery webhooks (added to the backend)

The Cloudflare Worker now accepts signed Resend events at:

\`POST https://<your-live-Worker-or-domain>/api/email/resend/webhook\`

Create a webhook in Resend for these event types: \`email.sent\`,
\`email.delivered\`, \`email.delivery_delayed\`, \`email.bounced\`,
\`email.complained\`, \`email.failed\`, \`email.suppressed\`.

- Save the webhook's **signing secret**, beginning with \`whsec_\`,
  as protected Cloudflare \`RESEND_WEBHOOK_SECRET\` in the same deployment
  as the Worker. This is NOT \`RESEND_API_KEY\`.
- The server verifies Svix HMAC-SHA256 against the **exact raw request
  body** and validates the timestamp window (±5 minutes). Invalid calls
  receive HTTP 401. Repeated event IDs are deduplicated.
- Store no raw webhook bodies, customer email content, IPs or API keys.
  Only provider IDs, signed event types and receive timestamps are stored.
- A provider receipt is stored with each queued email; webhook events can
  arrive before receipts and are reconciled later. Do not mark a message
  delivered solely because Resend returned HTTP 200.
- Permanent bounces, provider suppression and spam complaints suppress
  further automated delivery to the relevant address and unsubscribe
  active optional marketing preferences. Do not automatically retry a
  suppressed address.
- The **Email Delivery Health** admin panel separately displays accepted,
  delivered-to-mail-server, bounced, delayed, complained and failed counts.
  Delivery to an email server does not prove placement in an inbox.
- Webhook delivery failures must be retried by Resend, and the endpoint
  must be reachable over HTTPS. The backend never treats unsigned callbacks
  as trusted.

Before using actual users, run a real verification, password reset,
order approval and teacher feedback in separate inboxes you control;
inspect Resend logs for delivery/bounce and the exact matching admin
counts. All passwords, API keys and webhook signing secrets belong in
the provider's secret manager, never in chat or version control.

Resend documentation:
- https://resend.com/docs/webhooks/verify-webhooks-requests
- https://resend.com/docs/webhooks/event-types
- https://resend.com/docs/dashboard/emails/idempotency-keys

Resend idempotency keys expire after 24 hours. Manual retries of much
older transport failures should be reviewed to avoid accidental duplicates.
