# Legwork full-stack testing without a paid domain

This repository supports GitHub Codespaces for **private, temporary** full-stack previews. Unlike GitHub Pages, Codespaces runs Express, SQLite, session cookies, the student area, and the admin API.

## Launch

1. Open https://github.com/Anastasia2627/Legwork/codespaces/new?ref=main and create a Codespace (2-core default is sufficient).
2. The dev container installs Node dependencies and starts `npm start` automatically on port 3000. If startup fails, run `bash .devcontainer/start.sh` in the terminal. Runtime logs: `tail -n 100 /tmp/legwork-codespace.log`.
3. Open the **Ports** tab and open port **3000**. GitHub provides a unique `https://<codespace-name>-3000.app.github.dev` address.
4. The port is **private** by default and accessible only to the Codespace owner signed into GitHub. To share a testing URL, use Ports → Port Visibility → Public **only with disposable demo accounts and data**. Make it private again after sharing.

## Limits and safety

- The preview only runs while the Codespace is active. It is **not an always-on hosting solution**. The URL may change if you create a different Codespace.
- Database: `data/legwork.sqlite` inside the Codespace; changes usually survive restarting the **same** Codespace but are lost if the Codespace is deleted. Do not enter real client/student data.
- Payments are disabled. No real checkout or payment capture is possible. SMTP is not configured, so email verification and password-reset delivery will not work until a test mail service is connected.
- The administrator account is not automatically seeded. For a private admin test, set `ADMIN_PASSWORD` (strong unique password, 12+ characters) in [Codespaces secrets](https://github.com/settings/codespaces) **before creating a fresh Codespace and database**, then use the username `Admin`. Never commit the password.
- Never make an instance with private course video links, student records or real payment credentials publicly accessible.
- GitHub personal accounts include limited monthly Codespaces usage; check your quota and billing settings before starting.
- For always-on testing/production, use an HTTPS Node/Docker host with persistent disk and set production `SITE_ORIGIN`, `SESSION_SECRET`, `ADMIN_PASSWORD`, SMTP and backups. The eventual custom domain is configured at the host and does not require rebuilding the application.
