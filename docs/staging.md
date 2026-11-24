# Isolated LEGWORK staging (Cloudflare Workers)

The original `legwork-school` Worker and its Durable Object ID
`legwork-production` must never be renamed. The separate Wrangler
`env.staging` deploys as `legwork-school-staging` with a completely
separate Durable Object namespace and object ID `legwork-staging`.
No production accounts, sessions, orders or images are copied.

## Setup and checks

1. Run `npm ci && npm test && npm run cloudflare:check &&
   npm run cloudflare:staging:check`. These are read-only dry runs.
2. For staging, create **different** Cloudflare secrets using
   `npx wrangler secret put SESSION_SECRET --env staging`,
   `npx wrangler secret put ADMIN_PASSWORD --env staging`,
   `npx wrangler secret put SITE_ORIGIN --env staging`.
   The staging `SITE_ORIGIN` must be
   `https://legwork-school-staging.<account-subdomain>.workers.dev`.
   Never share a production secret or copy customer data into staging.
3. Explicitly deploy only staging with
   `npm run cloudflare:staging:deploy`. This command does not deploy
   the production Worker.
4. Verify `/health` with dummy data. Staging payments and public
   search indexing are disabled in config and fail closed if enabled.

To deploy production, check Cloudflare's actual integration:
Build `npm run build`; Deploy `npx wrangler deploy`; branch `main`.
Check the exact deployed SHA and production data before inviting users.

Staging binding configuration follows:
https://developers.cloudflare.com/durable-objects/reference/environments/
and https://developers.cloudflare.com/workers/wrangler/environments/

**Note:** this commit configures staging but does not create it in the user's
Cloudflare account. Independent backups are still required beyond PITR.
