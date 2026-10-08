#!/usr/bin/env bash
# Split perde/ (with history) out of boxdrank into its own repository.
# Prerequisite: an EMPTY repository exists at github.com/<owner>/perde (see docs/SETUP_WITH_CHROME.md §4).
# Usage, from anywhere inside a clone of boxdrank:
#   perde/scripts/extract-to-own-repo.sh [owner] [repo]
set -euo pipefail
owner="${1:-pabsamuel}"
repo="${2:-perde}"
root="$(git rev-parse --show-toplevel)"
cd "$root"
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "Run this from main after the Perde PR has merged (currently on $(git rev-parse --abbrev-ref HEAD))." >&2
  exit 1
fi
echo "▶ splitting perde/ history…"
split_sha="$(git subtree split --prefix=perde)"
tmp="$(mktemp -d)"
git clone -q "$root" "$tmp/src"
cd "$tmp/src"
git checkout -q -b perde-main "$split_sha"
mkdir -p .github/workflows
# Workflows lived at the boxdrank root; bring them along, dropping the perde/ prefixes.
for wf in perde-ci.yml perde-deploy.yml; do
  if [ -f "$root/.github/workflows/$wf" ]; then
    sed -e 's#- "perde/\*\*"#- "**"#' \
        -e '/working-directory: perde/d' \
        -e '/^defaults:$/d' -e '/^  run:$/d' \
        -e 's#perde/package.json#package.json#' \
        -e 's#perde/pnpm-lock.yaml#pnpm-lock.yaml#' \
        -e 's#path: perde/#path: #' \
        -e 's#perde/playwright-report#playwright-report#' \
        -e 's#perde/test-results#test-results#' \
        -e 's#perde/docs/DEPLOY.md#docs/DEPLOY.md#' \
        "$root/.github/workflows/$wf" > ".github/workflows/${wf#perde-}"
  fi
done
git add .github/workflows
git commit -q -m "Move workflows to repository root after extraction" || true
git remote add target "git@github.com:$owner/$repo.git"
echo "▶ pushing to $owner/$repo as main…"
git push -u target perde-main:main
cat <<MSG

Done. Next:
  1. Re-create repository secrets on $owner/$repo: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
     and the variables from docs/DEPLOY.md.
  2. Check .github/workflows/ci.yml and deploy.yml on the new repo (the sed above is best-effort).
  3. Remove perde/ from boxdrank in a follow-up PR: git rm -r perde .github/workflows/perde-*.yml
MSG
