#!/usr/bin/env bash
# One-command local bootstrap (docs/operations/LOCAL_DEVELOPMENT.md).
set -euo pipefail
cd "$(dirname "$0")/../.."

command -v docker >/dev/null || { echo "Docker is required"; exit 1; }
command -v pnpm >/dev/null || corepack enable

[ -f .env ] || cp .env.example .env
pnpm install
docker compose up -d
echo "Waiting for postgres…"
until docker compose exec -T postgres pg_isready -U globalemotes >/dev/null 2>&1; do sleep 1; done
pnpm db:migrate
pnpm db:seed
echo
echo "Ready. Start everything with: pnpm dev"
echo "  web     http://localhost:3000"
echo "  api     http://localhost:3001/v1/health"
echo "  mailpit http://localhost:8025"
