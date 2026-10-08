#!/usr/bin/env bash
# Applies the database migrations to the freshly provisioned Railway Postgres,
# then smoke-tests the deployed API.
#
# Migrations normally run inside Railway as the api service's pre-deploy
# command (railway.json): once per deployment, before it goes live, and a
# failure fails that deployment instead of crash-looping the service. The
# runner can only run them itself when the Postgres service has a public
# (TCP proxy) URL, which the provisioning does not create; without one this
# script skips straight to the smoke test, whose database-backed check is
# what proves the migrations were applied.
set -uo pipefail

cd "$(dirname "$0")/../.."

note() { echo "::notice title=$1::$2"; }
warn() { echo "::warning title=$1::$2"; }
fail() { echo "::error title=$1::$2"; exit 1; }

echo "──────── read the Postgres public URL ────────"
# The in-network DATABASE_URL is only routable from inside Railway; a runner
# needs the public one.
PGURL="$(railway variable list --service Postgres --json 2>/dev/null \
         | jq -r '.DATABASE_PUBLIC_URL // empty')"
if [ -z "${PGURL}" ]; then
  note "Migrations" "Postgres has no public URL, so they ran inside Railway as the api pre-deploy command (railway.json). The smoke test's database lookup below confirms the schema is there."
else
  echo "Got a public Postgres URL (${#PGURL} chars)."
  echo "──────── install and migrate ────────"
  corepack enable
  pnpm install --frozen-lockfile --filter @global-emotes/database...
  DATABASE_URL="${PGURL}" pnpm --filter @global-emotes/database db:migrate \
    || fail "Migrations failed" "The schema was not applied, so the API will answer 500 on anything that touches the database. The failure is in the published run log."
  note "Migrations" "Applied."
fi

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
# After a redeploy the pre-deploy migrations and the rollout happen after
# `railway up --ci` returns, so allow a few minutes, not seconds.
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
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
