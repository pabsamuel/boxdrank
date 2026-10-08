#!/bin/sh
# Applies database migrations, then starts the API in the same process.
#
# Why here and not as a Railway pre-deploy command: railway.json's
# preDeployCommand is legacy config-as-code, which Railway no longer honours
# for services created through the CLI (its replacement is an authoring file
# under .railway/, applied with `railway config apply`). The symptom was an API
# that answered /v1/health with 200 while every database-backed route returned
# 500, because the schema had never been applied.
#
# Running them here instead needs no Railway-specific configuration, works the
# same locally and on any host, and happens on every deploy.
#
# If migrations fail this exits non-zero without starting the server. That is
# deliberate: Railway then marks the deployment failed and keeps the previous
# version serving, which is better than a new version that is up but answers
# 500 on everything.
#
# Note on replicas: migrations run once per container start, so more than one
# replica would run them concurrently. Drizzle records applied migrations in a
# table, but that is not a lock -- before scaling past one replica, move this
# to a release step or take a Postgres advisory lock around it.
set -e

echo "entrypoint: applying database migrations"
if ! apps/api/node_modules/.bin/tsx packages/database/src/migrate.ts; then
  echo "entrypoint: migrations FAILED -- not starting the API" >&2
  exit 1
fi
echo "entrypoint: migrations done, starting the API"

# exec so the API becomes PID 1 and receives SIGTERM directly; without it the
# shell would swallow the signal and the platform would wait out its grace
# period on every deploy.
exec apps/api/node_modules/.bin/tsx apps/api/src/index.ts
