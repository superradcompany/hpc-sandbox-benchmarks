#!/usr/bin/env bash
# Linux integration fixture; run in a disposable container with git, GNU time, and /tmp limited
# below 32MiB. Usage: diagnostic-staging.sh /path/to/harness
set -euo pipefail
repo=${1:?harness repository path required}
fixture=$(mktemp -d)
mkdir -p "$fixture/lib/pts/realworld" "$fixture/packages/schema/src/pts-profiles/local/realworld-mastra-1.0.0"
printf 'PIN_SHA=fixture\n' > "$fixture/packages/schema/src/pts-profiles/local/realworld-mastra-1.0.0/target.env"
cat > "$fixture/lib/pts/realworld/install.sh" <<'INSTALL'
set -eu
case "$PWD" in /var/lib/phoronix-test-suite/*) ;; *) echo 'wrong filesystem' >&2; exit 88 ;; esac
cp "$(dirname "$0")/realworld-runner.sh" .
mkdir work
dd if=/dev/zero of=work/dependency bs=1048576 count=32 2>/dev/null
printf 'install fixture\n'
INSTALL
cat > "$fixture/lib/pts/realworld/realworld-runner.sh" <<'RUNNER'
printf 'task fixture\n'
exit 7
RUNNER
git -C "$fixture" init -q
git -C "$fixture" -c user.name=Test -c user.email=test@example.com commit --allow-empty -qm fixture
code=0
bash "$repo/lib/pts/realworld/diagnostic-task.sh" "$fixture" mastra test_core mastra-heap4096-worker1-v1 || code=$?
[ "$code" = 7 ]
out="$fixture/benchmark-results/diagnostic-mastra-heap4096-worker1-v1"
for file in task.log install.log environment.log target.env outcome.json; do [ -f "$out/$file" ]; done
[ ! -d "$out/work" ]
grep -q 'task fixture' "$out/task.log"
grep -q '"exitCode":7' "$out/outcome.json"
printf 'root-backed staging, exit status and evidence-only collection passed\n'
