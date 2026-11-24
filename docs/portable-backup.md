# LEGWORK portable encrypted backup — Cloudflare DO

In addition to Cloudflare's 30-day PITR history, administrators can obtain an
**independent encrypted copy** of the SQL tables and Durable Object WebP
images to an owner-controlled local disk. There is NO automatic upload to any
storage provider, no Google Drive or S3 integration and no production restore
API. Performing a verified offsite backup remains an operator responsibility.

## Export on owner's computer

1. Confirm production Cloudflare deploy and `/health`. Use a quiet
   maintenance window with no orders, registrations, mail processing or
   staff editing. A multi-request pagination export is **not** an atomic
   database snapshot while live writes continue.
2. On a private machine with Node 22, `npm ci`.
3. Run:
   `npm run backup:cloudflare -- https://legwork-school.<your-workers-subdomain>.workers.dev ./backups/legwork-2026-11-24.legwork-backup`
   (replace the origin with the currently verified school origin).
4. Enter the administrator password and a long, unique encryption
   passphrase. Neither is printed on screen or stored in the repository.
5. The script creates a short-lived, administrator/session-bound export
   token (20 minutes), fetches metadata, paginates SQL tables, downloads
   referenced Cloudflare images, hashes them and **encrypts directly to
   disk with AES-256-GCM + scrypt**.
6. After upload/download, it independently decrypts and restores data
   into a **temporary local SQLite database**, verifies table/image counts,
   foreign keys, integrity and cryptographic authentication, then securely
   removes the temporary directory. No plaintext permanent DB is created.
7. Put the encrypted `.legwork-backup` in owner-controlled, backed-up
   external storage. Keep a separate protected record of the encryption
   passphrase. Test decryption periodically.

Check an existing archive without connecting to the site:
`npm run backup:verify -- ./backups/legwork-2026-11-24.legwork-backup`

These tools are meant for an owner/private machine. A raw SQL export must
never be emailed, pasted into a chat or committed to GitHub. Even encrypted
archives contain personal and payment records and require access control.

## Security properties

- The API requires an authenticated administrator and **fresh password
  re-entry** to create a 20-minute export token. The API token is SHA-256
  hashed at rest and only sent as an HTTP header.
- The archive includes all app-owned SQL tables (except ephemeral export
  session tokens), metadata for indexes, triggers and views, and each
  image referenced in `uploaded_images`. Internal Cloudflare `__cf_`
  and SQLite internal tables are excluded.
- The archive is encrypted on the owner's computer, not on the
  Cloudflare Worker. Every API reply travels over HTTPS.
- The offline verifier never uploads data and cleans up the disposable
  restored database and decrypted images.
- **NO** production database restore endpoint is exposed; restoring a live
  school requires a documented maintenance/change procedure, payment
  reconciliation, fresh session secret and review of student access.

## Limitations / remaining release gate

This is a **manual** independent-backup mechanism, not scheduled backups
with external retention and alerts. The database could change during an
export. The manifest checks detect changed table counts or media metadata,
but not every possible concurrent update. Only export during a
maintenance window. Real end-to-end backup + verification against the
actual owner's Cloudflare environment has not yet been demonstrated,
and restoring into a new Cloudflare DO namespace has not been implemented.
Keep sales disabled until an operator successfully tests the policy and
recovery procedure on disposable staging data. Recheck retention rules for
student privacy.

Never turn on paid providers or upload real personal records to staging
for the purpose of testing backup imports.
