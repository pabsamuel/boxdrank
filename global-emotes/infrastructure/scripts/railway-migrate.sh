#!/usr/bin/env bash
# Applies the database migrations to the freshly provisioned Railway Postgres,
# then smoke-tests the deployed API.
#
# Migrations run from here rather than from the container's start command on
# purpose: a start-command migration runs on every replica boot and turns a
# migration failure into a crash loop with no clear cause.
set -uo pipefail

cd "$(dirname "$0")/../.."

note() { echo "::notice title=$1::$2"; }
warn() { echo "::warning title=$1::$2"; }
fail() { echo "::error title=$1::$2"; exit 1; }

echo "──────── read the Postgres public URL ────────"
# The in-network DATABASE_URL is only routable from inside Railway; a runner
# needs the public one.
PGURL="$(timeout 300 railway variable list --service Postgres --json </dev/null 2>/dev/null \
         | jq -r '.DATABASE_PUBLIC_URL // empty')"
if [ -z "${PGURL}" ]; then
  fail "No database URL" \
    "Could not read DATABASE_PUBLIC_URL from the Postgres service. Run migrations once by hand: set DATABASE_URL to the Postgres service's DATABASE_PUBLIC_URL and run 'pnpm --filter @global-emotes/database db:migrate'."
fi
echo "Got a public Postgres URL (${#PGURL} chars)."

echo "──────── install and migrate ────────"
corepack enable
pnpm install --frozen-lockfile --filter @global-emotes/database...
DATABASE_URL="${PGURL}" pnpm --filter @global-emotes/database db:migrate \
  || fail "Migrations failed" "The schema was not applied, so the API will answer 500 on anything that touches the database. The failure is in the published run log."
note "Migrations" "Applied."

echo "──────── smoke test ────────"
DOMAIN="$(cat /tmp/api-domain.txt 2>/dev/null || true)"
if [ -z "${DOMAIN}" ]; then
  warn "Smoke test skipped" "No API domain was captured, so the deployed API could not be checked."
  exit 0
fi
base="https://${DOMAIN}"

# A container that has only just been given a domain may not be serving yet, so
# wait for /v1/health before running the real checks -- otherwise the first
# cold-start second reads as a failed deploy.
for attempt in 1 2 3 4 5 6; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${base}/v1/health" || echo 000)"
  [ "${code}" = "200" ] && break
  echo "  health -> ${code}, retrying in $(( attempt * 5 ))s"
  sleep $(( attempt * 5 ))
done

# The real checks live in smoke.sh, which is also the hand-run deploy gate;
# duplicating them here would let the two drift apart.
if ./infrastructure/scripts/smoke.sh "${base}"; then
  note "LIVE" "${base} -- health, OpenAPI and a database-backed lookup all pass."
else
  fail "Smoke test failed" "The API at ${base} did not pass its checks. Which check failed is in the published run log."
fi
