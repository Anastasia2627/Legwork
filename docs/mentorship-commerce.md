# LEGWORK Mentorship commerce: what is safe to enable

Owner approval and real WayForPay merchant connection are required
before selling anything. This section is implemented but **not**
a claim that the merchant, checkout or callback endpoint has been
verified in the owner's production account.

## Package editor
1. In Admin Studio open **Mentorship · Package Prices & Promised
   Deadlines**.
2. Enter a price in **integer USD cents**. For example, entering
   2500 means $25.00; this is an illustration only and is NOT an
   approved LEGWORK price.
3. Enter the number of **business days after verified payment**
   the school is committing to, according to its written offer.
4. Check Publish only after instructor and legal/policy approval.
   Saving while unpublished retains a private draft; entering blank
   values produces no price and no public promise.
5. Neither public marketing nor checkout can rely on unpublished
   draft values. Republishing at a new price affects future
   requests only; existing quotes keep their original price/time.

## Student request & checkout
- An active published package produces an immutable pending order
  and private request. Student sees the saved USD price and response
  deadline in Account → Reviews. Account → Overview lists any
  pending invoice in the normal checkout section.
- With PAYMENT_PROVIDER=disabled the order is visible but no
  button can charge a card. Invoices cannot be created on the
  WayForPay gateway until real merchant configuration is approved.
- When a merchant is configured, the student confirms the actual
  UAH amount, then submits a signed form to hosted WayForPay. The
  server saves the USD amount, fixed conversion rate and integer
  UAH total. Browser redirects or screenshots never authorize
  feedback or paid access.
- Only a valid signed Approved callback changes the request to
  \`paid\`. Students cannot set their own status, amount or quote.
- Staff can review paid requests and deliver private feedback.
  Provider refunds/voids must be resolved before another reply
  is sent.

## Manual verification & reconciliation
- A request without a published offer remains manual and does not
  create a WayForPay order. Confirm the terms with the student
  separately BEFORE requesting money.
- For quoted requests, staff verification marks both the order and
  request paid atomically, only after independent payment checks.
- Once an online payment attempt is pending, staff verification and
  cancellation are BLOCKED until the provider status is resolved.
- If a declined invoice is manually reconciled and a late valid
  Approved callback arrives, flag it for review rather than
  granting twice or claiming a second payment was received.
- Do not auto-refund, auto-revoke a paid mentoring service, or
  reopen a payment without a reviewed contract and provider rules.
- Ensure support can investigate disputes using the payment attempt
  reference and a valid merchant dashboard.

## Pre-launch checklist
- [ ] Instructor-approved Basic & Deep price, scope, turnaround,
      business-day definition, refund/appeal terms and disclosures
- [ ] Registered/verified merchant, merchant domain, secrets kept in
      Cloudflare protected configuration (never in code or chat)
- [ ] Fixed, owner-approved USD→UAH conversion policy and clearly
      displayed final UAH payment amount
- [ ] Production HTTPS origin, Resend and WayForPay callbacks tested
      with the provider's real environment and disposable accounts
- [ ] Synthetic integration and browser tests green in GitHub Actions
- [ ] Reconcile a provider-approved legitimate low-value payment and
      confirm request status changes once; test decline and refund
      treatment using the provider's supported testing methods
- [ ] Legal pages, privacy data retention and video link sharing
      permissions approved by owner
- [ ] Verified backup and incident/chargeback response process

No prices, merchant credentials or video materials were fabricated
or published as part of implementing this system.
