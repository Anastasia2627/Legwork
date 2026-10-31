#!/usr/bin/env bash
set -euo pipefail

# Disposable, production-mode smoke test. No live domains or payment credentials.
RUN_KEY="$(date +%s)-$$"
IMAGE="legwork-production-smoke:$RUN_KEY"
CONTAINER="legwork-smoke-$RUN_KEY"
VOLUME="legwork-smoke-data-$RUN_KEY"
HOST_PORT="31182"
ORIGIN="https://legwork-preview.example.invalid"
ADMIN_PASSWORD="$(openssl rand -hex 24)"
SESSION_SECRET="$(openssl rand -hex 32)"

cleanup() {
  docker logs "$CONTAINER" --tail 70 2>/dev/null || true
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build --pull --tag "$IMAGE" .
docker volume create "$VOLUME" >/dev/null

start_container() {
  docker run -d --name "$CONTAINER" \
    -p "127.0.0.1:$HOST_PORT:3000" \
    --mount "type=volume,source=$VOLUME,target=/app/data" \
    -e NODE_ENV=production -e PORT=3000 \
    -e DATABASE_PATH=/app/data/legwork.sqlite \
    -e SITE_ORIGIN="$ORIGIN" \
    -e SESSION_SECRET="$SESSION_SECRET" \
    -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e PAYMENT_PROVIDER=disabled \
    -e PUBLIC_INDEXING_ENABLED=false \
    "$IMAGE" >/dev/null
}

ready() {
  for i in $(seq 1 75); do
    if curl --fail --silent --output /dev/null "http://127.0.0.1:$HOST_PORT/health"; then
      return 0
    fi
    sleep 1
  done
  echo "Production container failed its readiness check" >&2
  exit 1
}

assert_code() {
  local path="$1" expected="$2" actual
  actual="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$HOST_PORT$path")"
  test "$actual" = "$expected" || { echo "$path returned $actual instead of $expected" >&2; exit 1; }
}

assert_admin_login() {
  local result
  result="$(curl --fail --silent --show-error "http://127.0.0.1:$HOST_PORT/api/auth/login" \
    -H "Content-Type: application/json" -H "Origin: $ORIGIN" \
    --data "{\"email\":\"Admin\",\"password\":\"$ADMIN_PASSWORD\"}")"
  printf '%s' "$result" | grep -q '"role":"admin"' || {
    echo "Admin sign-in failed in production mode" >&2
    exit 1
  }
}

start_container
ready
assert_code '/' 200
assert_code '/course' 200
assert_code '/shop' 200
assert_code '/mentorship' 200
assert_code '/health' 200
assert_code '/sitemap.xml' 404

curl --fail --silent "http://127.0.0.1:$HOST_PORT/robots.txt" | grep -q 'Disallow: /'
curl --fail --silent "http://127.0.0.1:$HOST_PORT/" | grep -q 'noindex,nofollow'
curl --fail --silent "http://127.0.0.1:$HOST_PORT/api/payments/config" | grep -q '"enabled":false'
curl --fail --silent "http://127.0.0.1:$HOST_PORT/api/email/config" | grep -q '"enabled":false'
assert_admin_login

# Restart the container against the same SQLite volume.
docker rm -f "$CONTAINER" >/dev/null
start_container
ready
assert_admin_login
echo "Production image, integrations, HTTPS origin and persistent database passed."
