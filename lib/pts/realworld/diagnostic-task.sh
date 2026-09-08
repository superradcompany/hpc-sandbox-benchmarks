#!/usr/bin/env bash
set -euo pipefail
# Run inside ONE dedicated 4-vCPU/8192-MiB/40-GiB benchmark sandbox, never on the worker host.
# Usage: run-task.sh <harness-repo> <mastra|openclaw> <task> <config-id> [upstream-pin]
repo=$(cd "$1" && pwd)
suite=$2
task=$3
config=$4
pin=${5:-}
case "$suite/$task/$config" in
  openclaw-v2/all/openclaw-v2-all-fd-hard-v1|openclaw-v2/test_types/openclaw-v2-test-types-go2g-v1|openclaw-v2/all/openclaw-v2-all-throttled-fd-v1|openclaw-v2/all/openclaw-v2-all-throttled-fd16384-v1) ;;
  mastra/test_core/mastra-heap4096-worker1-v1) ;;
  openclaw/test_unit_fast/openclaw-fd-hard-v1) ;;
  openclaw/lint_oxlint/openclaw-original-diagnostic-v1) ;;
  openclaw/shrinkwrap_check/openclaw-pin-candidate-v1) [ -n "$pin" ] ;;
  *) echo 'unsupported diagnostic configuration' >&2; exit 2 ;;
esac
# Match the real benchmark workspace: guest /tmp may be a small tmpfs.
stage_base=/var/lib/phoronix-test-suite
mkdir -p "$stage_base"
root=$(mktemp -d "$stage_base/hpc-diagnostic-${config}.XXXXXX")
output="$repo/benchmark-results/diagnostic-$config"
[ ! -e "$output" ] || { echo "diagnostic output already exists" >&2; exit 2; }
mkdir -p "$output"
# Preserve evidence, not the multi-gigabyte dependency/work tree. The guest owns that temporary tree.
compiler_sampler_pid=
# shellcheck disable=SC2329 # Called indirectly by the EXIT trap below.
preserve_logs() {
  status=$?
  if [ -n "$compiler_sampler_pid" ]; then
    kill "$compiler_sampler_pid" 2>/dev/null || true
    wait "$compiler_sampler_pid" 2>/dev/null || true
  fi
  for file in install.log task.log environment.log task-outcomes.jsonl compiler-samples.jsonl; do
    if [ -f "$root/$file" ]; then cp "$root/$file" "$output/$file"; fi
  done
  if [ -f "$root/source/target.env" ]; then cp "$root/source/target.env" "$output/target.env"; fi
  printf '{"config":"%s","exitCode":%s}\n' "$config" "$status" > "$output/outcome.json"
}
trap preserve_logs EXIT
mkdir "$root/source" "$root/install"
cp "$repo/lib/pts/realworld/"{install.sh,realworld-runner.sh} "$root/source/"
cp "$repo/packages/schema/src/pts-profiles/local/realworld-${suite}-1.0.0/target.env" "$root/source/"
if [ "$config" = openclaw-v2-test-types-go2g-v1 ]; then
  cat >> "$root/source/target.env" <<'ENV'
TASK_CMD_test_types="OPENCLAW_LOCAL_CHECK=1 OPENCLAW_LOCAL_CHECK_MODE=throttled GOMEMLIMIT=2GiB GOGC=10 GOMAXPROCS=1 pnpm check:test-types"
ENV
fi
if [[ "$config" = openclaw-v2-all-throttled-fd-v1 || "$config" = openclaw-v2-all-throttled-fd16384-v1 ]]; then
  cat "$repo/lib/pts/realworld/openclaw-v2-throttled.env" >> "$root/source/target.env"
fi
if [ -n "$pin" ]; then
  [[ "$pin" =~ ^[0-9a-f]{40}$ ]] || exit 2
  printf '\nPIN_SHA="%s"\n' "$pin" >> "$root/source/target.env"
fi
if [ "$config" = mastra-heap4096-worker1-v1 ]; then
  cat >> "$root/source/target.env" <<'ENV'
# DIAGNOSTIC CONFIGURATION v1: not comparable to the historical test_core timing.
TASK_CMD_test_core="NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter ./packages/core exec vitest run --exclude '**/tool-builder/**' --maxWorkers=1"
ENV
fi
{
printf 'config=%s suite=%s task=%s artifact_dir=%s\n' "$config" "$suite" "$task" "$root"
printf 'harness_sha=%s\n' "$(git -C "$repo" rev-parse HEAD)"
printf 'node_version=%s\n' "$(node --version)"
printf 'nofile_before soft=%s hard=%s\n' "$(ulimit -Sn)" "$(ulimit -Hn)"
} | tee "$root/environment.log"
if [[ "$config" = openclaw-fd-hard-v1 || "$config" = openclaw-v2-all-fd-hard-v1 || "$config" = openclaw-v2-test-types-go2g-v1 || "$config" = openclaw-v2-all-throttled-fd-v1 || "$config" = openclaw-v2-all-throttled-fd16384-v1 ]]; then ulimit -Sn "$(ulimit -Hn)"; fi
if [[ "$config" = openclaw-v2-all-throttled-fd16384-v1 ]]; then
  [ "$(ulimit -Sn)" = 16384 ] && [ "$(ulimit -Hn)" = 16384 ] || { echo "requested nofile16384 was not applied" >&2; exit 1; }
fi
printf 'nofile_after soft=%s hard=%s\n' "$(ulimit -Sn)" "$(ulimit -Hn)" | tee -a "$root/environment.log"
# Guest remains at the normal resource spec; runner retains MemTotal-1GiB task cgroup cap.
export HOME="$root/install"
export REALWORLD_TASK_TIMEOUT_SECONDS=1200
export TEST_SILENT_MODE=1
cd "$root/install"
timeout --kill-after=30 1800 /usr/bin/time -v sh "$root/source/install.sh" > "$root/install.log" 2>&1
if [ "$config" = openclaw-v2-test-types-go2g-v1 ]; then
  node "$repo/lib/pts/realworld/compiler-sampler.mjs" "$root/compiler-samples.jsonl" &
  compiler_sampler_pid=$!
fi
tasks=("$task")
if [[ "$config" = openclaw-v2-all-fd-hard-v1 || "$config" = openclaw-v2-all-throttled-fd-v1 || "$config" = openclaw-v2-all-throttled-fd16384-v1 ]]; then
  tasks=(git_clone cold_install lint_oxlint lint_extensions typecheck npm_lock_check test_unit_fast test_types)
fi
# Bound the complete task sequence as well as each command. Keep failed tasks visible.
deadline=$((SECONDS + 3000))
# shellcheck source=/dev/null
source "$repo/lib/pts/realworld/diagnostic-sequence.sh"
status=0
run_diagnostic_sequence "$root" "$deadline" "${tasks[@]}" || status=$?
printf 'task_exit=%s artifact_dir=%s\n' "$status" "$root"
exit "$status"
