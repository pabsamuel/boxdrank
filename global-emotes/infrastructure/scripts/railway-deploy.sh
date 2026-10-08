#!/usr/bin/env bash
# Provisions the Railway project and deploys the API.
#
# Run from a GitHub runner by .github/workflows/railway-deploy.yml, which
# supplies RAILWAY_API_TOKEN (account-scoped) and the optional storage/email
# secrets. Results worth reading afterwards are emitted as GitHub annotations,
# because this script's stdout reaches the author only via the published log.
set -euo pipefail

cd "$(dirname "$0")/../.."
PROJECT_NAME="${PROJECT_NAME:-global-emotes}"

note()  { echo "::notice title=$1::$2"; }
fail()  { echo "::error title=$1::$2"; exit 1; }
phase() { echo; echo "──────── $* ────────"; }

# ── guard against creating a second project ──────────────────────────────────
# `railway init` always creates; run twice and the account ends up with two
# projects of the same name and one orphaned database. Stop instead, and say
# what to do, rather than silently duplicating paid infrastructure.
phase "check for an existing project"
existing="$(railway list --json 2>/dev/null || echo '[]')"
if printf '%s' "$existing" | grep -q "\"${PROJECT_NAME}\""; then
  fail "Project already exists" \
    "An account project named '${PROJECT_NAME}' is already there. This script only does first-time provisioning; re-running it would create a duplicate project and a second database. Deploy a code change with 'railway up' against the existing project instead, or delete the old project first if provisioning is meant to start over."
fi

# Railway builds the Dockerfile at the root of whatever directory is uploaded.
# Ours lives under infrastructure/docker and its build context is this
# directory, so copy it to where the builder looks.
cp infrastructure/docker/Dockerfile.api ./Dockerfile

phase "create project"
railway init --name "${PROJECT_NAME}" --json

phase "add Postgres and Redis"
railway add --database postgres --json
railway add --database redis --json

phase "create the api service"
railway add --service api --json

# Railway's own variable references use the same ${ { } } form as GitHub
# expressions, which would be substituted away before the runner ever saw
# them. Build the opening braces at runtime so the literal reaches Railway.
O='${'
set_var() {
  railway variable set --service api --skip-deploys "$1" >/dev/null
  echo "  set ${1%%=*}"
}

phase "variables"
set_var "NODE_ENV=production"
set_var "BRAND_NAME=${BRAND_NAME:-Global Emotes}"
set_var "DATABASE_URL=${O}{Postgres.DATABASE_URL}}"
set_var "REDIS_URL=${O}{Redis.REDIS_URL}}"
# Generated here and never printed: they exist only inside Railway.
set_var "SESSION_SECRET=$(openssl rand -base64 36 | tr -d '\n=' | tr '+/' 'Aa')"
set_var "TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)"
set_var "LOG_LEVEL=info"
set_var "API_PORT=3001"
set_var "S3_REGION=auto"
set_var "S3_BUCKET_ORIGINALS=emote-originals"
set_var "S3_BUCKET_PROCESSED=emote-processed"
set_var "S3_BUCKET_QUARANTINE=uploads-quarantine"

if [ -n "${S3_ENDPOINT:-}" ]; then
  set_var "S3_ENDPOINT=${S3_ENDPOINT}"
  set_var "S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID:-}"
  set_var "S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY:-}"
else
  note "Storage unconfigured" "No S3_ENDPOINT secret, so emote uploads will fail until the R2 credentials are added. Everything else works."
fi

if [ -n "${SMTP_HOST:-}" ]; then
  set_var "EMAIL_PROVIDER=smtp"
  set_var "SMTP_HOST=${SMTP_HOST}"
  set_var "SMTP_PORT=465"
  set_var "SMTP_SECURE=true"
  set_var "SMTP_USER=${SMTP_USER:-}"
  set_var "SMTP_PASS=${SMTP_PASS:-}"
else
  note "Email unconfigured" "No SMTP_HOST secret, so magic-link sign-in cannot deliver mail. The API boots and public endpoints work, but nobody can sign in yet."
fi

phase "deploy api"
railway up --service api --ci

phase "public domain"
railway domain --service api --port 3001 --json | tee /tmp/domain.json || true
DOMAIN="$(jq -r '.domain // .domains[0]? // empty' /tmp/domain.json 2>/dev/null || true)"
if [ -z "${DOMAIN}" ]; then
  # Fall back to scraping a hostname out of whatever shape the CLI printed,
  # so a JSON key rename does not lose the one value this run exists to produce.
  DOMAIN="$(grep -oE '[a-z0-9-]+\.up\.railway\.app' /tmp/domain.json 2>/dev/null | head -1 || true)"
fi
if [ -n "${DOMAIN}" ]; then
  note "API domain" "https://${DOMAIN}"
  echo "${DOMAIN}" > /tmp/api-domain.txt
else
  echo "::warning title=Domain unknown::The deploy finished but no public domain could be read from 'railway domain'. Check the service's Settings -> Networking in the dashboard."
fi

phase "project status"
railway status --json || true

note "Deployed" "Migrations have not run yet; that is the next step and it needs the database's public URL."
