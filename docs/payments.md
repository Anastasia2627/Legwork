# Legwork payments — WayForPay integration

Status: code integrated and tested with synthetic callbacks; **real acquiring NOT enabled**, and no real merchant credentials are committed.

## Provider
WayForPay secure hosted checkout (Purchase).
Official docs: https://wiki.wayforpay.com/en/view/852102

WayForPay's Purchase API requires a merchant account, merchant domain, purchase HMAC-MD5 signature, amount in UAH and a signed payment-result notification to the configured serviceUrl. This integration uses a redirect/form POST to WayForPay, so Legwork does not store card details.

## Configuration

Register and verify the merchant account and approved website domain in WayForPay. Deploy Legwork on a public HTTPS site with a persistent database. Configure the following deployment-only environment variables:

- PAYMENT_PROVIDER=wayforpay
- WAYFORPAY_MERCHANT_ACCOUNT=... (merchant's real account)
- WAYFORPAY_SECRET_KEY=... (merchant's real secret; never exposed to browser)
- WAYFORPAY_DOMAIN=... (optional: exact approved merchant domain, no scheme)
- WAYFORPAY_UAH_PER_USD=... (explicit merchant-approved rate for display; decimal with max two places)
- SITE_ORIGIN=https://... (public HTTPS URL, exact web origin)
- SESSION_SECRET=... (separate random 32+ character signing secret)
- ADMIN_PASSWORD=... (server-only, set on first database creation)

Do **not** copy example test keys to production. Do **not** treat the payment provider's test merchant as a real merchant.

## Existing price model and important restriction

The course catalog currently stores prices in integer USD cents (e.g., 16000 = 160.00 USD).
WayForPay Purchase uses a UAH primary amount. Legwork requires an explicitly configured fixed store conversion rate (UAH per USD) and converts to integer UAH kopecks. The rate, USD total, and final UAH amount are saved in the payment attempt and cannot be altered by the browser or by later edits to product prices.

Do not enable checkout until the store owner approves a price policy, UAH conversion rate, and the currency/terms displayed to customers. The rate is a merchant setting, **not a live exchange-rate API quote**.

## Checkout sequence

1. Student requests course, individual lesson(s), or lesson bundle(s). The server creates pending orders with authoritative catalog prices; **no access yet**.
2. Student selects owned pending orders and clicks PAY. Server ensures every ID belongs to the logged-in user, is still pending, is not already in an outstanding payment attempt, and has a valid amount.
3. A payment_attempts record snapshots the order IDs, USD amount, store conversion rate and UAH amount. Each attempt has a unique orderReference.
4. The server constructs signed WayForPay Purchase form fields. Browser posts directly to https://secure.wayforpay.com/pay. The merchant SecretKey is NOT included.
5. WayForPay calls POST /api/payments/wayforpay/webhook. This endpoint is intentionally exempt from same-origin CSRF checks because it is a provider-to-provider request; it instead checks the merchant ID, known orderReference, provider HMAC-MD5 signature, amount, currency and payment status.
6. Only an **Approved** callback changes orders to approved and grants course/lesson/bundle access in one SQLite transaction. Provider callback retries are recorded once, and repeat callbacks are acknowledged without duplicate access.
7. The browser may return to /#/payment/{attempt_id}. This page checks the database status; browser redirects DO NOT approve orders.
8. Declined/expired attempts do not grant access. Refunded/voided states are flagged for manual review; refunds and entitlement revocation need a separately reviewed accounting policy before public launch.

## Operations & security

- HMAC-MD5 is mandatory for this provider protocol; it is not the password hashing algorithm. User passwords remain scrypt-hashed.
- Never issue access from the WayForPay redirect URL, query parameters, a frontend state, or an unverified webhook.
- A signed callback with an amount or currency mismatch does not grant access.
- Payment and order ownership is checked on every read/write.
- Public repository contains no real credentials or customer payment details.
- Store only transaction references and statuses, not card numbers, tokens or personal billing records from callbacks.
- Monitoring / payment reconciliation, refunds, chargebacks, taxes/invoicing, customer notifications, webhook delivery monitoring and production dispute handling must be configured before commercial rollout.
- Configure a WayForPay test account/sandbox, verify return URL and callback delivery from WayForPay itself, and reconcile a real low-value merchant-authorized payment after legal/billing readiness. The current CI uses **synthetic signed callbacks**, not live PSP processing.
- Keep the application on one persistent SQLite instance. Do not scale to several stateless replicas until migrating payment/order accounting to a transactional managed database.

## Tests

Run npm test for integration coverage of signature verification, forged notifications, amount and currency mismatch, server-side pricing, duplicate callbacks, ownership, manual admin access and automatic provisioning. Run npm run test:e2e to check the disabled-checkout screen and browser interaction.

## Activation gate

The UI remains in manual-request mode when any payment variable is missing, the provider is not explicitly set to wayforpay, the rate is invalid, or SITE_ORIGIN is not HTTPS. HTTP is accepted only for NODE_ENV=test to exercise the isolated integration suite.
