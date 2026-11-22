# LEGWORK — Enzonic free Node.js server deployment

> Status: **deployment instructions only**. No Enzonic account has been connected and the application has **not** been deployed. Do not enable live payments or public indexing during evaluation.

## Why this host

Enzonic advertises one free always-on Node.js server (512 MB RAM, 50% CPU, 10 GB storage; subject to availability) with Node.js 22, Git sync, and a free HTTPS subdomain. Verify the actual free offer and storage persistence in the account dashboard before relying on it for customer data.

Official: https://enzonic.com/nodejs | https://enzonic.com/web-hosting

## Initial setup

1. Sign in to https://panel.enzonic.com/ . Create a free **Node.js server** (not the stateless Enzonic Deploy/functions product). Pick Node.js 22.
2. Import `https://github.com/Anastasia2627/Legwork` branch `main` via Git sync. Do not upload `.env`, SQLite databases, secrets or customer files into Git.
3. Install dependencies with `npm install --omit=dev --no-audit --no-fund`. Native dependencies `better-sqlite3` and `sharp` must compile/install successfully.
4. Set startup command to `npm start` (runs `node server.js`). Use port `3000` unless the panel allocates another port; then pass its allocated `PORT`.
5. Provide the variables below through the host's private environment/secret settings, NOT in the repository:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` or allocated port |
   | `DATABASE_PATH` | `./data/legwork.sqlite` **only if the `data/` directory is persistent across restarts and Git sync** |
   | `SITE_ORIGIN` | Exact `https://...` public URL assigned by Enzonic, without a trailing path |
   | `SESSION_SECRET` | Unique random secret, at least 32 characters (suggest 64 hex chars) |
   | `ADMIN_PASSWORD` | Unique password of at least 12 characters; do not share in chat |
   | `PAYMENT_PROVIDER` | `disabled` |
   | `PUBLIC_INDEXING_ENABLED` | `false` |
   | `TRUST_PROXY_HOPS` | `0` unless the host verifies the reverse-proxy hop count |

6. Confirm the site is reachable by HTTPS and `GET /health` returns `{"ok":true}`. Check cookie-based login, registration, admin login and private video authorization.
7. Test persistence explicitly: create disposable account/content, restart server, redeploy via Git sync, confirm all data **and uploaded images** survive. Confirm an external encrypted SQLite backup and restore process. Never use real users until this succeeds.
8. For production email configure SMTP and validate delivered verification/reset emails. Then supply legal terms, real lesson videos, images, accurate pricing and merchant provider credentials. Payments require verified signed callbacks and real provider-supported testing.

## Critical notes

- The free tier is a **testing candidate**, not verified for production reliability or data protection.
- Enzonic **Deploy** (serverless) is not equivalent to an Enzonic **Node.js server** with a persistent filesystem; do not deploy the current SQLite app to an ephemeral function service.
- The public media uploads and SQLite database must both live on durable storage, excluded from Git sync replacement.
- YouTube embedded videos are accessible to authorized viewers; the ID can be copied and screen recording cannot be prevented.
- Automated refunds, legal retention/deletion, external email and WayForPay provisioning remain incomplete regardless of hosting.
- Do not use uptime pingers or other techniques that violate free-tier terms.
