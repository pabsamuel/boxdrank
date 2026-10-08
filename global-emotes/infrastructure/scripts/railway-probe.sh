#!/usr/bin/env bash
# Prints the installed Railway CLI's real command surface. Read before writing
# any provisioning step: the CLI's flags have changed shape across versions and
# guessing them from documentation has already produced two wrong commands here.
#
# Changes nothing. Auth-free except the last two calls, which are skipped
# without a token.
set -uo pipefail

echo "railway version: $(railway --version 2>&1)"

for c in "" "init" "add" "variable" "variables" "up" "domain" "service" "link" "list" "status" "run" \
         "tcp-proxy" "ssh" "connect" "config" "deployment" "postgres" "api" "service source"; do
  echo
  echo "═══════════ railway ${c:-<root>} --help ═══════════"
  railway $c --help 2>&1
done

echo
if [ -n "${RAILWAY_API_TOKEN:-}" ]; then
  echo "═══════════ railway whoami ═══════════"
  railway whoami 2>&1 | head -5
  echo "═══════════ railway list ═══════════"
  railway list 2>&1 | head -40
else
  echo "(no RAILWAY_API_TOKEN — skipping the calls that need auth)"
fi
