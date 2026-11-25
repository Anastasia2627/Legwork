# LEGWORK — safe student registration launch on Cloudflare

**Status:** registration launch code is prepared in `main`. Production stays **closed by default** until the owner has tested real email delivery and explicitly enables it. A green GitHub build or `/health` does **not** verify email inbox delivery. Do not ask students to sign up until the checks pass.

## What is already implemented

- `GET /api/email/config` returns `enabled`, `provider`, `verification_required` and `registration_open`. This endpoint returns no credentials and uses `Cache-Control: no-store`.
- `POST /api/auth/register` requires `mail.registrationOpen` in production, not merely the presence of SMTP/Resend credentials. It fails closed with HTTP 503 while enrollment is unavailable.
- The frontend hides the misleading production sign-up form until `registration_open===true`, but keeps login for existing students and public catalog browsing.
- Admin Studio → **Email Delivery Health** displays a separate **STUDENT REGISTRATION** status card.
- Local test/development registration still works without a live email provider.
- The production Cloudflare Worker copies `REGISTRATION_OPEN` from the runtime environment into the private Durable Object application. Staging uses its own Worker and storage namespace.
- This flag does not affect `PAYMENT_PROVIDER=disabled`, student permissions, or existing sessions.

## Provider and domain setup (owner actions)

1. Register in [Resend](https://resend.com/) and add a **domain or subdomain you own** under **Domains**. The public site can stay on `workers.dev`, but that hostname is not a verified outgoing email domain.
2. Copy the sender's **actual DNS records shown by Resend** into the corresponding domain's DNS panel. Confirm Resend displays **Verified**. Do not guess DKIM/SPF record names or values.
3. Create a limited API key that can send from that verified domain. Never paste the key in chat, GitHub, screenshots or Build variables.
4. Set the following in the **staging Worker runtime** (Settings → Variables and Secrets or `wrangler secret put --env staging`, if staging is deployed):

   | Name | Type | Value |
   | --- | --- | --- |
   | `RESEND_API_KEY` | Secret | New provider API key |
   | `MAIL_FROM` | Text | `LEGWORK <hello@your-verified-domain>` (replace with a real verified domain) |
   | `SESSION_SECRET` | Secret | Separate random 64-character hex string |
   | `ADMIN_PASSWORD` | Secret | Separate strong test-admin password |
   | `SITE_ORIGIN` | Text | Exact `https://legwork-school-staging.<your-subdomain>.workers.dev` URL |
   | `REGISTRATION_OPEN` | Text | `true` **only for isolated staging test**, never for production at this stage |
   | `RESEND_WEBHOOK_SECRET` | Secret | Signing secret from the Resend webhook configuration |

5. In Resend **Webhooks**, register `POST https://<staging-worker>/api/email/resend/webhook` for the documented delivery events; verify a signed webhook reaches the app and the admin's delivery metrics update. The secret beginning `whsec_` differs from `RESEND_API_KEY`.

**Important:** A Cloudflare dashboard's Build variables are not the Worker runtime secrets. Add values under the Worker **Settings → Variables and Secrets** and apply/deploy. Do not store new passwords in `wrangler.jsonc`.

## Staging acceptance — use only disposable identities

With the separate staging deployment described in [staging.md](staging.md):
1. Check `/health` returns `{"ok":true}` and `/api/email/config` returns `{"enabled":true,"registration_open":true,...}`.
2. Create a disposable student with an inbox you own. Receive the verify link; check it works only once and expires after 24 hours. Check the student cannot buy before verification.
3. Use **Forgot password**. Receive a real reset email, verify the link is single-use and expires after 30 minutes, confirm the old password and previous sessions are invalid, and log in with the new password.
4. Inspect Resend **Emails** and webhook delivery status. An accepted API request is not proof of actual inbox delivery; look for the messages in the inbox, including spam, and check the admin panel.
5. Confirm anonymous users receive 401 on dashboard, admin APIs and protected lesson video routes.
6. Exercise one manual release of an address previously suppressed by a **test** bounce only after verifying Resend provider status. Never use customer addresses in staging.

## Production rollout, intentionally separate

1. In the production `legwork-school` Worker, configure the verified `RESEND_API_KEY`, `MAIL_FROM` and `RESEND_WEBHOOK_SECRET` with the production `SITE_ORIGIN`. Keep existing production secrets and Durable Object storage unchanged.
2. Keep **`REGISTRATION_OPEN=false`** while checking `/health`, `/api/email/config` (`enabled=true, registration_open=false`), email webhooks and the admin's email status. There is no open public registration at this stage.
3. After staging inbox tests pass, the owner can explicitly set the production **Text** runtime variable `REGISTRATION_OPEN=true` and apply changes. Do not modify production SQL, customer data or payment settings during this action.
4. Confirm `/api/email/config` returns `registration_open=true` and do one production registration with an inbox owned by the school; confirm verification and reset delivery, then monitor the first real students.
5. If signups or delivery are broken, immediately set `REGISTRATION_OPEN=false` and apply the change. This closes **new** registrations but preserves existing accounts, course access, and login. Inspect the encrypted outbox and Resend provider logs separately before trying again.

Do not open live payments, publish unlicensed YouTube videos or accept real purchases because email works. Those are separate release gates.

## Automated checks

```bash
npm test
npm run cloudflare:check
npm run cloudflare:smoke
```

The tests cover mail configuration, production rollout gate, no provider signup, token rotation/expiry, sender delivery receipts and webhook signature checks. They use disposable data and mocks rather than real inboxes.

Official references:
- https://developers.cloudflare.com/workers/configuration/environment-variables/
- https://resend.com/docs
- https://resend.com/docs/webhooks/verify-webhooks-requests
