#!/usr/bin/env bash
# Run in a disposable Linux Node22 container with git and GNU timeout; requires npm registry access.
set -euo pipefail
repo=${1:?harness repository required}
fixture=$(mktemp -d)
mkdir -p "$fixture/upstream" "$fixture/profile" "$fixture/legacy-install" "$fixture/fixed-install"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
npm install --global --prefix "$fixture/legacy" pnpm@10.34.3 >/dev/null 2>&1
export PATH="$fixture/legacy/bin:$PATH"
cd "$fixture/upstream"
printf '{"name":"launcher-fixture","version":"1.0.0","packageManager":"pnpm@12.1.0","dependencies":{"is-number":"7.0.0"}}\n' > package.json
corepack pnpm install --lockfile-only >/dev/null 2>&1
git init -q
git add package.json pnpm-lock.yaml
git -c user.name=Test -c user.email=test@example.com commit -qm fixture
pin=$(git rev-parse HEAD)
cp "$repo/lib/pts/realworld/"{install.sh,realworld-runner.sh} "$fixture/profile/"
cat > "$fixture/profile/target.env" <<ENV
REPO_URL="file://$fixture/upstream"
PIN_SHA="$pin"
NODE_VERSION="22"
TASK_CMD_cold_install="pnpm install --frozen-lockfile"
ENV
cd "$fixture/legacy-install"
export HOME="$PWD"
code=0
sh "$fixture/profile/install.sh" > "$fixture/legacy.log" 2>&1 || code=$?
[ "$code" = 2 ]
grep -q 'Syntax error' "$fixture/legacy.log"
printf '\nPACKAGE_MANAGER_DRIVER="corepack"\n' >> "$fixture/profile/target.env"
cd "$fixture/fixed-install"
export HOME="$PWD"
sh "$fixture/profile/install.sh" > "$fixture/fixed.log" 2>&1
sh ./realworld-runner.sh cold_install >> "$fixture/fixed.log" 2>&1
grep -q 'REALWORLD_RESULT_SECONDS:' "$fixture/fixed.log"
[ "$(cd work && PATH="$fixture/fixed-install/.package-manager-bin:$PATH" COREPACK_HOME="$fixture/fixed-install/.corepack" pnpm --version)" = 12.1.0 ]
printf 'legacy launcher fails as observed; exact pinned Corepack install and cold reset pass\n'
