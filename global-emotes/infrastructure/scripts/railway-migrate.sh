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
PGURL="$(timeout 300 railway variable list --service Postgres --json </dev/null 2>/dev/null \
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

# `railway up --ci` returns when the build is done; the pre-deploy migrations
# and the rollout happen after that while the PREVIOUS deployment keeps
# serving, and it answers /v1/health with 200 too. So wait until the health
# response names the deployment this run uploaded (railway-redeploy.sh records
# its id; /v1/health echoes RAILWAY_DEPLOYMENT_ID). On a first-time deploy
# there is no previous version, so a plain 200 is enough.
WANT="$(cat /tmp/deployment-id.txt 2>/dev/null || true)"
echo "──────── wait for the new deployment ────────"
deadline=$(( $(date +%s) + 600 ))
while :; do
  body="$(curl -sS --max-time 20 "${base}/v1/health" 2>/dev/null || true)"
  live="$(printf '%s' "${body}" | jq -r '.deployment // empty' 2>/dev/null || true)"
  if printf '%s' "${body}" | grep -q '"ok":true'; then
    if [ -z "${WANT}" ] || [ "${live}" = "${WANT}" ]; then
      echo "  serving deployment ${live:-<unknown>}"
      break
    fi
    echo "  serving ${live:-<unknown>}, waiting for ${WANT}"
  else
    echo "  health not ready yet"
  fi
  if [ "$(date +%s)" -ge "${deadline}" ]; then
    fail "Rollout did not finish" "Deployment ${WANT:-<unknown>} was not serving ${base}/v1/health within 10 minutes (last seen: ${live:-none}). The pre-deploy migrations may have failed; the deployment log in the Railway dashboard says why, and the previous version keeps serving meanwhile."
  fi
  sleep 15
done

# The real checks live in smoke.sh, which is also the hand-run deploy gate;
# duplicating them here would let the two drift apart. A couple of retries
# cover the first seconds after cutover, when the pool is still connecting.
for attempt in 1 2 3; do
  if ./infrastructure/scripts/smoke.sh "${base}"; then
    note "LIVE" "${base} -- health, OpenAPI and a database-backed lookup all pass."
    exit 0
  fi
  [ "${attempt}" -lt 3 ] && { echo "  smoke test failed on attempt ${attempt}, retrying in 20s"; sleep 20; }
done

# Everything below is diagnosis for the published run log: what the API
# answered, what the service is configured to do, and what it logged.
echo "──────── diagnostics: error body ────────"
curl -sS --max-time 20 "${base}/v1/public/creators/smoke-diagnostic" || true
echo
echo "──────── diagnostics: api service settings (is railway.json applied?) ────────"
railway status --json 2>/dev/null \
  | jq '.environments.edges[].node.serviceInstances.edges[].node
         | select(.serviceName == "api")
         | {serviceName,
            latestDeployment: {id: .latestDeployment.id, status: .latestDeployment.status},
            deploy: .latestDeployment.meta.serviceManifest.deploy
                    | {preDeployCommand, healthcheckPath, startCommand}}' 2>/dev/null \
  || echo "(railway status unavailable)"
echo "──────── diagnostics: deployment log of ${WANT:-latest} ────────"
if [ -n "${WANT}" ]; then
  railway logs "${WANT}" --service api --lines 200 2>&1 | tail -200 || true
else
  railway logs --service api --latest --lines 200 2>&1 | tail -200 || true
fi
fail "Smoke test failed" "The API at ${base} did not pass its checks. Which check failed, the API's error body, its service settings and its deployment log are in the published run log."
