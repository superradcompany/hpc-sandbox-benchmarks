#!/usr/bin/env bash
# Linux integration fixture; run in a disposable container with git, GNU time, and /tmp limited
# below 32MiB. Usage: diagnostic-staging.sh /path/to/harness
set -euo pipefail
repo=${1:?harness repository path required}
fixture=$(mktemp -d)
mkdir -p "$fixture/lib/pts/realworld" "$fixture/packages/schema/src/pts-profiles/local/realworld-mastra-1.0.0"
printf 'PIN_SHA=fixture\n' > "$fixture/packages/schema/src/pts-profiles/local/realworld-mastra-1.0.0/target.env"
cp "$repo/lib/pts/realworld/diagnostic-sequence.sh" "$fixture/lib/pts/realworld/"
cat > "$fixture/lib/pts/realworld/install.sh" <<'INSTALL'
set -eu
case "$PWD" in /var/lib/phoronix-test-suite/*) ;; *) echo 'wrong filesystem' >&2; exit 88 ;; esac
cp "$(dirname "$0")/realworld-runner.sh" .
mkdir work
dd if=/dev/zero of=work/dependency bs=1048576 count=32 2>/dev/null
printf 'install fixture\n'
INSTALL
cat > "$fixture/lib/pts/realworld/realworld-runner.sh" <<'RUNNER'
printf 'task fixture %s\n' "$1"
sleep 1
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

mkdir -p "$fixture/packages/schema/src/pts-profiles/local/realworld-openclaw-v2-1.0.0"
printf 'PIN_SHA=fixture\n' > "$fixture/packages/schema/src/pts-profiles/local/realworld-openclaw-v2-1.0.0/target.env"
code=0
bash "$repo/lib/pts/realworld/diagnostic-task.sh" "$fixture" openclaw-v2 all openclaw-v2-all-fd-hard-v1 || code=$?
[ "$code" = 7 ]
out="$fixture/benchmark-results/diagnostic-openclaw-v2-all-fd-hard-v1"
[ "$(wc -l < "$out/task-outcomes.jsonl")" = 8 ]
for task in git_clone cold_install lint_oxlint lint_extensions typecheck npm_lock_check test_unit_fast test_types; do
  grep -q "\"task\":\"$task\",\"exitCode\":7" "$out/task-outcomes.jsonl"
done
printf 'all eight v2 tasks preserve individual failures and continue sequentially\n'

cp "$repo/lib/pts/realworld/compiler-sampler.mjs" "$fixture/lib/pts/realworld/"
code=0
bash "$repo/lib/pts/realworld/diagnostic-task.sh" "$fixture" openclaw-v2 test_types openclaw-v2-test-types-go2g-v1 || code=$?
[ "$code" = 7 ]
out="$fixture/benchmark-results/diagnostic-openclaw-v2-test-types-go2g-v1"
[ "$(wc -l < "$out/task-outcomes.jsonl")" = 1 ]
grep -q '"task":"test_types","exitCode":7' "$out/task-outcomes.jsonl"
grep -q 'GOMEMLIMIT=2GiB GOGC=10 GOMAXPROCS=1 pnpm check:test-types' "$out/target.env"
[ -f "$out/compiler-samples.jsonl" ]
printf 'single complete test-type probe preserves configured Go controls and sampler evidence\n'
cp "$repo/lib/pts/realworld/openclaw-v2-throttled.env" "$fixture/lib/pts/realworld/"
code=0
bash "$repo/lib/pts/realworld/diagnostic-task.sh" "$fixture" openclaw-v2 all openclaw-v2-all-throttled-fd-v1 || code=$?
[ "$code" = 7 ]
out="$fixture/benchmark-results/diagnostic-openclaw-v2-all-throttled-fd-v1"
[ "$(wc -l < "$out/task-outcomes.jsonl")" = 8 ]
grep -q 'TASK_CMD_lint_oxlint="OPENCLAW_LOCAL_CHECK=1 OPENCLAW_LOCAL_CHECK_MODE=throttled pnpm lint"' "$out/target.env"
grep -q 'TASK_CMD_typecheck="OPENCLAW_LOCAL_CHECK=1 OPENCLAW_LOCAL_CHECK_MODE=throttled pnpm tsgo:prod"' "$out/target.env"
for task in git_clone cold_install lint_oxlint lint_extensions typecheck npm_lock_check test_unit_fast test_types; do
  grep -q "\"task\":\"$task\",\"exitCode\":7" "$out/task-outcomes.jsonl"
done
printf 'throttled candidate preserves all eight tasks and exact command overrides\n'

code=0
(ulimit -Sn 4096; ulimit -Hn 4096; bash "$repo/lib/pts/realworld/diagnostic-task.sh" "$fixture" openclaw-v2 all openclaw-v2-all-throttled-fd16384-v1) || code=$?
[ "$code" = 1 ]
mv "$fixture/benchmark-results/diagnostic-openclaw-v2-all-throttled-fd16384-v1" "$fixture/benchmark-results/rejected-nofile4096"
code=0
(ulimit -Sn 16384; ulimit -Hn 16384; bash "$repo/lib/pts/realworld/diagnostic-task.sh" "$fixture" openclaw-v2 all openclaw-v2-all-throttled-fd16384-v1) || code=$?
[ "$code" = 7 ]
out="$fixture/benchmark-results/diagnostic-openclaw-v2-all-throttled-fd16384-v1"
[ "$(wc -l < "$out/task-outcomes.jsonl")" = 8 ]
grep -q 'nofile_after soft=16384 hard=16384' "$out/environment.log"
printf 'explicit nofile candidate rejects wrong limits and preserves all eight tasks\n'

sequence=$(mktemp -d)
(
  cd "$sequence"
  # shellcheck source=/dev/null
source "$repo/lib/pts/realworld/diagnostic-sequence.sh"
  cat > realworld-runner.sh <<'SEQUENCE_RUNNER'
echo invoked >> invocations
case "$1" in slow) sleep 5 ;; *) exit 7 ;; esac
SEQUENCE_RUNNER
  code=0
  run_diagnostic_sequence "$sequence" "$SECONDS" never || code=$?
  [ "$code" = 124 ] && [ ! -f invocations ]
  grep -q '"task":"never","exitCode":124,"started":false,"elapsedSeconds":0' task-outcomes.jsonl
  grep -q '"reason":"sequence_budget_exhausted"' task-outcomes.jsonl
  code=0
  run_diagnostic_sequence "$sequence" "$((SECONDS + 10))" fails || code=$?
  [ "$code" = 7 ]
  grep -q '"task":"fails","exitCode":7,"started":true' task-outcomes.jsonl
  code=0
  run_diagnostic_sequence "$sequence" "$((SECONDS + 1))" slow after || code=$?
  [ "$code" = 124 ]
  grep -q '"task":"slow","exitCode":124,"started":true' task-outcomes.jsonl
  grep -q '"task":"after","exitCode":124,"started":false' task-outcomes.jsonl
  [ "$(wc -l < invocations)" = 2 ]
)
printf 'sequence provenance distinguishes unstarted tasks and started failures/timeouts\n'
