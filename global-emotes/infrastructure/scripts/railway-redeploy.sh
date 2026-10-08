#!/usr/bin/env bash
# Deploys the current code to the EXISTING Railway project. The counterpart of
# railway-deploy.sh, which only does first-time provisioning.
#
# Run from a GitHub runner by .github/workflows/railway-deploy.yml, which
# supplies RAILWAY_API_TOKEN (account-scoped), RAILWAY_PROJECT_ID,
# RAILWAY_ENVIRONMENT_ID and API_DOMAIN.
#
# Migrations are not run here: railway.json at the root of the upload sets the
# api service's pre-deploy command, so Railway runs them in the built image,
# on its own network, before this deployment goes live. A failed migration
# fails the deployment and leaves the previous one serving.
set -euo pipefail

cd "$(dirname "$0")/../.."

note() { echo "::notice title=$1::$2"; }
fail() { echo "::error title=$1::$2"; exit 1; }
phase() { echo; echo "──────── $* ────────"; }

: "${RAILWAY_PROJECT_ID:?set RAILWAY_PROJECT_ID to the project to deploy into}"
: "${RAILWAY_ENVIRONMENT_ID:?set RAILWAY_ENVIRONMENT_ID to the environment to deploy into}"

# Railway builds the Dockerfile at the root of whatever directory is uploaded
# (see railway-deploy.sh).
cp infrastructure/docker/Dockerfile.api ./Dockerfile

phase "link the existing project"
railway link --project "${RAILWAY_PROJECT_ID}" --environment "${RAILWAY_ENVIRONMENT_ID}" --service api --json \
  || fail "Link failed" "Could not link project ${RAILWAY_PROJECT_ID} / environment ${RAILWAY_ENVIRONMENT_ID}. If the project was deleted, run the workflow in 'deploy' mode to provision a new one and update the IDs in the workflow."

phase "deploy api"
# --ci streams the build log and exits when the build completes; the
# pre-deploy command and the rollout happen on Railway's side after that.
if ! railway up --service api --ci 2>&1 | tee /tmp/up.log; then
  fail "Deploy failed" "The build of the api service failed. The build log is in the published run log."
fi

# `railway up --ci` returns when the BUILD is done; the pre-deploy command and
# the rollout happen afterwards, while the previous deployment keeps serving.
# Record the new deployment's id so the smoke test can wait for it to be the
# one answering /v1/health rather than passing against the old version.
DEPLOYMENT_ID="$(grep -oE 'id=[0-9a-f-]{36}' /tmp/up.log | head -1 | cut -d= -f2 || true)"
if [ -n "${DEPLOYMENT_ID}" ]; then
  echo "${DEPLOYMENT_ID}" > /tmp/deployment-id.txt
  echo "new deployment: ${DEPLOYMENT_ID}"
else
  echo "::warning title=Deployment id unknown::Could not read the deployment id from 'railway up'; the smoke test will wait on timing alone."
fi

phase "public domain"
# The domain already exists; ask Railway for it anyway so the smoke test
# follows a rename, and fall back to the one recorded in the workflow.
railway domain --service api --port 3001 --json > /tmp/domain.json 2>/dev/null || true
DOMAIN="$(jq -r '.domain // .domains[0]? // empty' /tmp/domain.json 2>/dev/null | sed -E 's#^https?://##' || true)"
if [ -z "${DOMAIN}" ]; then
  DOMAIN="$(grep -oE '[a-z0-9-]+\.up\.railway\.app' /tmp/domain.json 2>/dev/null | head -1 || true)"
fi
DOMAIN="${DOMAIN:-${API_DOMAIN:-}}"
if [ -n "${DOMAIN}" ]; then
  echo "${DOMAIN}" > /tmp/api-domain.txt
  note "API domain" "https://${DOMAIN}"
else
  echo "::warning title=Domain unknown::No public domain could be read; the smoke test will be skipped."
fi

note "Deployed" "Build uploaded. Railway runs the pre-deploy migrations and rolls the new version out; the smoke test below waits for it."
