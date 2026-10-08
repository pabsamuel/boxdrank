#!/usr/bin/env bash
# Provisions the Railway project and deploys the API.
#
# Run from a GitHub runner by .github/workflows/railway-deploy.yml, which
# supplies RAILWAY_API_TOKEN (account-scoped) and the optional storage/email
# secrets. Results worth reading afterwards are emitted as GitHub annotations,
# because this script's stdout reaches the author only via the published log.
#
# Commands here follow `railway --help` as read by railway-probe.sh against the
# installed CLI, not documentation: the flags have changed shape across
# versions and guessing them has already produced wrong commands in this repo.
set -euo pipefail

cd "$(dirname "$0")/../.."
PROJECT_NAME="${PROJECT_NAME:-global-emotes}"

note()  { echo "::notice title=$1::$2"; }
fail()  { echo "::error title=$1::$2"; exit 1; }
phase() { echo; echo "──────── $* ────────"; }

# Several railway subcommands fall back to an interactive prompt when something
# is ambiguous -- `init`/`up` prompt for a workspace when the account has more
# than one. On a runner that prompt would block until the job's hard timeout,
# burning an hour to produce no output. Closing stdin and capping the wait turns
# that into a fast, named failure.
rw() { timeout 600 railway "$@" </dev/null; }

# ── guard against creating a second project ──────────────────────────────────
# `railway init` always creates. Run this twice and the account ends up with two
# projects of the same name and an orphaned database that still bills. Stop
# instead, and say what to do.
phase "check for an existing project"
existing="$(rw list --json 2>/dev/null || echo '[]')"
if printf '%s' "$existing" | grep -q "\"${PROJECT_NAME}\""; then
  fail "Project already exists" \
    "An account project named '${PROJECT_NAME}' is already there. This script only does first-time provisioning; re-running it would create a duplicate project and a second database. To ship a code change, deploy to the existing project with 'railway up' instead. To start provisioning over, delete the old project first."
fi

# Railway builds the Dockerfile at the root of whatever directory is uploaded.
# Ours lives under infrastructure/docker and its build context is this
# directory, so copy it to where the builder looks.
cp infrastructure/docker/Dockerfile.api ./Dockerfile

phase "create project"
# --workspace is only needed when the account has several workspaces; with one
# the CLI auto-selects. Pass it when the secret is set so multi-workspace
# accounts do not hit the prompt.
if [ -n "${RAILWAY_WORKSPACE:-}" ]; then
  rw init --name "${PROJECT_NAME}" --workspace "${RAILWAY_WORKSPACE}" --json
else
  rw init --name "${PROJECT_NAME}" --json \
    || fail "Could not create the project" \
      "'railway init' failed. If the account has more than one workspace the CLI needs to be told which: add a repo secret RAILWAY_WORKSPACE holding the workspace's exact name or ID, then re-run. The CLI's own message is in the published run log."
fi

phase "add Postgres and Redis"
rw add --database postgres --json
rw add --database redis --json

phase "create the api service"
rw add --service api --json

# Railway's own variable references use the same ${ { } } form as GitHub
# expressions, which would be substituted away before the runner ever saw
# them. Build the opening brace at runtime so the literal reaches Railway.
O='${'

set_var() {
  rw variable set --service api --skip-deploys "$1" >/dev/null
  echo "  set ${1%%=*}"
}

# Secrets go in over stdin, per the CLI's own `variable set --stdin` form.
# A value passed as an argument is visible in the process list for as long as
# the command runs, and runners are shared infrastructure.
set_secret() {
  printf '%s' "$2" | rw variable set "$1" --stdin --service api --skip-deploys >/dev/null
  echo "  set $1 (via stdin)"
}

phase "variables"
set_var "NODE_ENV=production"
set_var "BRAND_NAME=${BRAND_NAME:-Global Emotes}"
set_var "DATABASE_URL=${O}{Postgres.DATABASE_URL}}"
set_var "REDIS_URL=${O}{Redis.REDIS_URL}}"
set_var "LOG_LEVEL=info"
set_var "API_PORT=3001"
set_var "S3_REGION=auto"
set_var "S3_BUCKET_ORIGINALS=emote-originals"
set_var "S3_BUCKET_PROCESSED=emote-processed"
set_var "S3_BUCKET_QUARANTINE=uploads-quarantine"

# Generated here, never printed, never stored outside Railway.
set_secret "SESSION_SECRET"        "$(openssl rand -base64 36 | tr -d '\n=' | tr '+/' 'Aa')"
set_secret "TOKEN_ENCRYPTION_KEY"  "$(openssl rand -hex 32)"

if [ -n "${S3_ENDPOINT:-}" ]; then
  set_var    "S3_ENDPOINT=${S3_ENDPOINT}"
  set_secret "S3_ACCESS_KEY_ID"     "${S3_ACCESS_KEY_ID:-}"
  set_secret "S3_SECRET_ACCESS_KEY" "${S3_SECRET_ACCESS_KEY:-}"
else
  note "Storage unconfigured" "No S3_ENDPOINT secret, so emote uploads will fail until the R2 credentials are added. Everything else works."
fi

if [ -n "${SMTP_HOST:-}" ]; then
  set_var    "EMAIL_PROVIDER=smtp"
  set_var    "SMTP_HOST=${SMTP_HOST}"
  set_var    "SMTP_PORT=465"
  set_var    "SMTP_SECURE=true"
  set_var    "SMTP_USER=${SMTP_USER:-}"
  set_secret "SMTP_PASS" "${SMTP_PASS:-}"
else
  note "Email unconfigured" "No SMTP_HOST secret, so magic-link sign-in cannot deliver mail. The API boots and public endpoints work, but nobody can sign in yet."
fi

phase "deploy api"
# --ci streams build logs and exits, so a failed build shows up here rather
# than as a mystery 502 later. No --detach: we want to wait for the build.
rw up --service api --ci \
  || fail "Build or deploy failed" "'railway up' did not succeed. The build log is in the published run log."

phase "public domain"
rw domain --service api --port 3001 --json | tee /tmp/domain.json || true
DOMAIN="$(jq -r '.domain // .domains[0]? // empty' /tmp/domain.json 2>/dev/null || true)"
if [ -z "${DOMAIN}" ]; then
  # Fall back to scraping a hostname out of whatever shape the CLI printed, so
  # a JSON key rename cannot lose the one value this run exists to produce.
  DOMAIN="$(grep -oE '[a-z0-9-]+\.up\.railway\.app' /tmp/domain.json 2>/dev/null | head -1 || true)"
fi
if [ -n "${DOMAIN}" ]; then
  note "API domain" "https://${DOMAIN}"
  echo "${DOMAIN}" > /tmp/api-domain.txt
else
  echo "::warning title=Domain unknown::The deploy finished but no public domain could be read from 'railway domain'. Check the service's Settings -> Networking in the dashboard."
fi

phase "project status"
rw status --json || true

note "Deployed" "Migrations have not run yet; that is the next step and it needs the database's public URL."
