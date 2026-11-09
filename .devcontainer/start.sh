#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data
if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
  echo "Legwork is already running on port 3000."
  exit 0
fi
export NODE_ENV=development
export PORT=3000
export DATABASE_PATH="./data/legwork.sqlite"
# The developer preview deliberately has no payment processor or live email.
export PAYMENT_PROVIDER=disabled
# Origin must match the HTTPS forwarded URL for login and registration POST requests.
if [[ -n "${CODESPACE_NAME:-}" ]]; then
  export SITE_ORIGIN="https://${CODESPACE_NAME}-3000.app.github.dev"
fi
# Admin authentication is only configured if you set ADMIN_PASSWORD in Codespaces secrets.
nohup npm start > /tmp/legwork-codespace.log 2>&1 < /dev/null &
echo "Legwork started in Codespaces. Logs: /tmp/legwork-codespace.log"
echo "Open the forwarded port 3000. It is private by default."
