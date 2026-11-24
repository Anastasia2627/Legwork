# LEGWORK administrator MFA

MFA is **optional until enabled** by a signed-in administrator.
After activation, administrator password login additionally requires
a fresh six-digit TOTP from an authenticator app OR an unused recovery code.
Student login is unaffected.

1. Open Admin Studio → **Admin Security · Two-factor authentication**.
2. Re-enter the current admin password. Copy the displayed Base32 secret
   into an authenticator app (Google Authenticator, 2FAS etc).
3. Enter the current six-digit code and the password to activate MFA.
4. Save the eight one-use recovery codes in a password manager offline.
   They are only displayed once and stored as hashes.
5. Sign out and confirm a subsequent admin login requires the
   authenticator code. Do not share or screenshot the secret/codes.
6. If you lose your device, enter an unused recovery code in the
   admin login form instead of the six-digit code.
7. Disabling MFA requires the current password and a fresh
   authenticator or backup code; all administrator sessions are revoked.

The TOTP secret is encrypted at rest with AES-256-GCM, using a key
derived from the production `SESSION_SECRET`. Rotating that secret
invalidates existing TOTP encryption; retain recovery codes or use
a reviewed operator recovery process. Existing sessions, CSRF,
rate limits and browser protections remain enabled. MFA protects
the LEGWORK admin account, **not** the owner's Cloudflare, GitHub
or mailbox account; enable their MFA independently.

Cloudflare admins must activate MFA themselves after deployment.
The backup CLI supports this by prompting for the second factor.
