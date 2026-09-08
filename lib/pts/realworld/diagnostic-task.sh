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
  mastra/test_core/mastra-heap4096-worker1-v1) ;;
  openclaw/test_unit_fast/openclaw-fd-hard-v1) ;;
  openclaw/lint_oxlint/openclaw-original-diagnostic-v1) ;;
  openclaw/shrinkwrap_check/openclaw-pin-candidate-v1) [ -n "$pin" ] ;;
  *) echo 'unsupported diagnostic configuration' >&2; exit 2 ;;
esac
root=$(mktemp -d "/tmp/hpc-diagnostic-${config}.XXXXXX")
output="$repo/benchmark-results/diagnostic-$config"
[ ! -e "$output" ] || { echo "diagnostic output already exists" >&2; exit 2; }
mkdir -p "$output"
# Preserve evidence, not the multi-gigabyte dependency/work tree. The guest owns that temporary tree.
preserve_logs() {
  status=$?
  for file in install.log task.log environment.log; do
    if [ -f "$root/$file" ]; then cp "$root/$file" "$output/$file"; fi
  done
  if [ -f "$root/source/target.env" ]; then cp "$root/source/target.env" "$output/target.env"; fi
  printf '{"config":"%s","exitCode":%s}\n' "$config" "$status" > "$output/outcome.json"
}
trap preserve_logs EXIT
mkdir "$root/source" "$root/install"
cp "$repo/lib/pts/realworld/"{install.sh,realworld-runner.sh} "$root/source/"
cp "$repo/packages/schema/src/pts-profiles/local/realworld-${suite}-1.0.0/target.env" "$root/source/"
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
printf 'nofile_before soft=%s hard=%s\n' "$(ulimit -Sn)" "$(ulimit -Hn)"
} | tee "$root/environment.log"
if [ "$config" = openclaw-fd-hard-v1 ]; then ulimit -Sn "$(ulimit -Hn)"; fi
printf 'nofile_after soft=%s hard=%s\n' "$(ulimit -Sn)" "$(ulimit -Hn)" | tee -a "$root/environment.log"
# Guest remains at the normal resource spec; runner retains MemTotal-1GiB task cgroup cap.
export HOME="$root/install"
export REALWORLD_TASK_TIMEOUT_SECONDS=1200
export TEST_SILENT_MODE=1
cd "$root/install"
timeout --kill-after=30 1800 /usr/bin/time -v sh "$root/source/install.sh" > "$root/install.log" 2>&1
set +e
timeout --kill-after=30 3000 /usr/bin/time -v sh ./realworld-runner.sh "$task" > "$root/task.log" 2>&1
status=$?
set -e
printf 'task_exit=%s artifact_dir=%s\n' "$status" "$root"
exit "$status"
