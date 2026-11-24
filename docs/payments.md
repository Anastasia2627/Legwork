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
4. The server constructs signed WayForPay Purchase form fields. The shopper confirms the exact UAH charge and exchange rate, then the browser posts directly to https://secure.wayforpay.com/pay. The merchant SecretKey is NOT included. The invoice remains available for 24 hours. If the browser tab closes, the shopper can continue the same payment attempt from their account without repricing or creating another order.
5. WayForPay calls POST /api/payments/wayforpay/webhook. This endpoint is intentionally exempt from same-origin CSRF checks because it is a provider-to-provider request; it instead checks the merchant ID, known orderReference, provider HMAC-MD5 signature, amount, currency and payment status.
6. Only an **Approved** callback changes orders to approved and grants course/lesson/bundle access in one SQLite transaction. Provider callback retries are recorded once, and repeat callbacks are acknowledged without duplicate access.
7. The browser may return to /#/payment/{attempt_id}. This page checks the database status; browser redirects DO NOT approve orders.
8. Declined/expired attempts do not grant access. A pending payment older than 24 hours cannot be automatically reopened: a staff reconciliation is required so a delayed signed callback is not mistaken for a new charge. Refunded/voided states are flagged for manual review; refunds and entitlement revocation need a separately reviewed accounting policy before public launch.

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


## Mentorship package payments (added 24 Nov 2026)

The school can now review and publish its **own** Basic/Deep package
offers in Admin Studio, using an approved **USD-cent price** and
**response time in business days after payment confirmation**.
Neither price nor turnaround is prefilled or published by default.
Publishing does not enable card processing or a merchant account.

- Public endpoint: \`GET /api/mentorship/offers\`. Until explicitly
  published, prices and response times are returned as null.
- Administrative read/write: \`GET /api/admin/mentorship/offers\`
  and \`PATCH /api/admin/mentorship/offers/:package\`.
  The PATCH requires both an exact positive price and a business-day
  deadline when \`published=true\`; unpublished drafts stay private.
- When a student submits a request under a published offer,
  the backend atomically creates a private mentorship request and a
  pending order of kind \`mentorship\`, capturing the exact price and
  stated turnaround. Editing the catalog afterward cannot reprice
  that student's pending order or alter its promised deadline.
- An unpublished package still accepts manual quote requests as
  before, but **no** online-checkout-eligible order is created until
  approved terms exist. No client-supplied price is accepted.
- Existing course/lesson/bundle WayForPay checkout also processes
  mentorship orders with the same merchant signature, frozen
  conversion rate, amount verification and trusted callback.
  Only a signed \`Approved\` notification marks the mentorship request
  as paid. The browser return URL never triggers this transition.
- Course/lesson entitlement approval remains separate: paying for
  mentorship does not unlock unrelated lessons.
- A pending mentorship quote is cancelled **with its linked order**
  in one transaction, only if no payment attempt is pending,
  approved or awaiting reconciliation. Generic order cancellation
  cannot bypass this rule.
- An administrator may manually verify an independently confirmed
  payment only while no active provider attempt is in progress.
  A late signed provider approval after manual verification moves the
  provider attempt to \`review_required\`, preventing a second
  fulfilment. Do not treat the flag as proof of a second charge.
- Refunds/voids leave access untouched pending staff reconciliation;
  **new or updated mentorship feedback is blocked** when the provider
  payment is flagged for review.
- Provider events and refund records remain read-only until a real
  merchant/acquirer has approved and tested the payment process.

**Operational gate:** actual prices, service deadline, customer
contract, refund policy, payment merchant, UAH conversion rate,
real callback URL and real low-value provider testing must all be
approved before setting \`PAYMENT_PROVIDER=wayforpay\`.
The test suite sends only synthetic signed callbacks, never real
card transactions. WayForPay official Purchase documentation:
https://wiki.wayforpay.com/en/view/852102
