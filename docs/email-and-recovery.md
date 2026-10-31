# Legwork email and account recovery

The mail infrastructure has been implemented but real SMTP is disabled until configured.

## Production configuration

Configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SITE_ORIGIN and SESSION_SECRET as protected deployment secrets. Use a verified sender domain with SPF, DKIM and DMARC. SITE_ORIGIN must be the public HTTPS origin. The server secret must be a high-entropy value at least 32 characters long.

## Workflows

Registration queues a confirmation message with a one-time 24-hour link. Users may sign in before confirming their address, but cannot initiate course purchases, submit mentorship requests, or pay via WayForPay until verified while email sending is active. Previously created student accounts are not automatically marked verified. Admin accounts are verified without public email recovery.

Forgot-password requests have a generic reply independent of account existence. The reset link expires after 30 minutes, can be used only once, enforces a 12–128 character password and revokes old sessions. Per-account cooldown is 10 minutes with a daily issue cap. Password change also verifies the email address.

Course purchase approvals (manual or signed WayForPay), homework reviews, and mentorship feedback queue notifications without exposing course video links, personal homework content or credentials.

## Durable outbox

Messages are queued in SQLite and their content is encrypted using AES-256-GCM derived from SESSION_SECRET. The single-process worker attempts delivery immediately, on startup and every 15 seconds, with exponential retries and up to eight attempts. Delivery failures do not alter the authoritative status of orders or course access. Sent payloads are cleared. Do not rotate SESSION_SECRET without migrating pending encrypted messages.

The worker is designed for a single-node SQLite instance. Multi-replica scaling requires a separately coordinated queue.

## Testing and launch

NODE_ENV=test plus MAIL_TEST_OUTBOX_PATH enables local synthetic delivery to a temporary file; it never sends real messages. Production registration is unavailable without configured SMTP, though existing accounts can sign in.

Run npm test for token, reset, verification and delivery tests. Run npm run test:e2e for user interface journeys. This implementation has not yet been tested with a real SMTP account.

Privacy policy, sender reputation, bounce/unsubscribe processing where applicable, backups and production monitoring are needed before public launch.
