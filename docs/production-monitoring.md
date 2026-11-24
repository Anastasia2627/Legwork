# LEGWORK production availability and response alerts

A **read-only** GitHub Actions workflow now checks the real production
URL every six hours (and can be run manually using "Run workflow").
It requests:
- `/health`: must return HTTP 200 and `{"ok":true}` after the
  Durable Object SQLite database has answered.
- `/`: must serve HTML containing LEGWORK/Svitlana school copy.

Each probe retries once. Any failed check marks the
**LEGWORK production availability** GitHub Action red. GitHub's
notification preferences determine who receives an email or app alert
for failed workflow runs. This workflow does not authenticate or access
customer records.

This does **not** prove that payments, Resend mail, signed webhook,
published videos, certificates or backups work. Consult the protected
Operations panel for aggregate failures and Cloudflare's Workers
Observability logs for request errors.

To configure real-time alerts for provider webhooks, mail delivery
and 5xx spikes, connect an owner-controlled notification channel
in Cloudflare/GitHub after confirming alert preferences. No
third-party monitoring service or paid subscription is activated.

Run manually locally with
`node scripts/production-health.mjs https://legwork-school.vlasiuk-anastasiia15.workers.dev`.

Current live website availability and production deployment have not
been verified from within ChatGPT.
