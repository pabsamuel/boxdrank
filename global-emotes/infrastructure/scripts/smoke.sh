#!/usr/bin/env sh
# Post-deploy smoke test — the four checks from DEPLOY_NOW.md, as one command.
#
#   ./infrastructure/scripts/smoke.sh https://api-emotes.example.com https://emotes.example.com
#
# Or via env: API_URL=... WEB_URL=... ./infrastructure/scripts/smoke.sh
# Exits non-zero if any check fails, so it works as a deploy gate.

set -u

API="${1:-${API_URL:-}}"
WEB="${2:-${WEB_URL:-}}"

if [ -z "$API" ] || [ -z "$WEB" ]; then
  echo "usage: $0 <api-base-url> <web-base-url>" >&2
  echo "   eg: $0 https://api-emotes.example.com https://emotes.example.com" >&2
  exit 2
fi

API="${API%/}"
WEB="${WEB%/}"
FAILED=0
CURL="curl -sS --max-time 20"

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILED=1; }

echo "smoke: api=$API web=$WEB"
echo

# 1 — API is up and is our service
echo "1. API health"
BODY=$($CURL -w '\n%{http_code}' "$API/v1/health" 2>/dev/null) || BODY=''
CODE=$(printf '%s' "$BODY" | tail -n1)
if [ "$CODE" = "200" ] && printf '%s' "$BODY" | grep -q '"ok":true'; then
  pass "200, ok:true"
else
  fail "expected 200 + ok:true, got HTTP '${CODE:-no response}'"
fi

# 2 — OpenAPI served (proves routes registered, not just a proxy answering)
echo "2. OpenAPI spec"
CODE=$($CURL -o /dev/null -w '%{http_code}' "$API/v1/openapi.json" 2>/dev/null) || CODE=''
if [ "$CODE" = "200" ]; then
  pass "200"
else
  fail "expected 200, got '${CODE:-no response}'"
fi

# 3 — Database reachable and migrated.
# A public, DB-backed lookup for a handle that cannot exist: 404 means the query
# ran, so Postgres is connected and the schema is present. 500 means it is not —
# the usual cause is a skipped `pnpm db:migrate` release step.
echo "3. Database (public creator lookup)"
PROBE="smoke-nonexistent-$(date +%s)"
CODE=$($CURL -o /dev/null -w '%{http_code}' "$API/v1/public/creators/$PROBE" 2>/dev/null) || CODE=''
case "$CODE" in
  404) pass "404 — query ran, DB connected and migrated" ;;
  500) fail "500 — DB unreachable or migrations not run (see DEPLOY_NOW.md step 2.5)" ;;
  *)   fail "expected 404, got '${CODE:-no response}'" ;;
esac

# 4 — Web app renders
echo "4. Web app"
CODE=$($CURL -o /dev/null -w '%{http_code}' -L "$WEB/" 2>/dev/null) || CODE=''
if [ "$CODE" = "200" ]; then
  pass "200"
else
  fail "expected 200, got '${CODE:-no response}'"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "All four checks passed — the deployment is live."
  echo "Next: log in with a magic link (needs RESEND_API_KEY), then create a pack"
  echo "and upload a PNG to exercise the asset pipeline and the CDN domain."
else
  echo "Smoke test FAILED. Full regression: docs/QA_TEST_PLAN.md" >&2
fi
exit "$FAILED"
