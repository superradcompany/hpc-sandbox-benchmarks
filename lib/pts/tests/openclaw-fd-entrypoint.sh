#!/usr/bin/env bash
# Exercise the real V2 entrypoint without installing or timing the workload.
set -euo pipefail
repo="${1:-$(git rev-parse --show-toplevel)}"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/.mise/tasks/benchmark/realworld/pts" "$fixture/lib"
git -C "$fixture" init -q
cp "$repo/.mise/tasks/benchmark/realworld/pts/openclaw-v2" "$fixture/.mise/tasks/benchmark/realworld/pts/"
cat > "$fixture/lib/bench.sh" <<'STUB'
run_realworld_pts() {
  [[ "$1" == openclaw-v2 ]]
  [[ "$(ulimit -Sn)" == 4096 ]]
  [[ "$(ulimit -Hn)" == 4096 ]]
  bash -c '[[ "$(ulimit -Sn)" == 4096 && "$(ulimit -Hn)" == 4096 ]]'
  printf 'V2 task and child inherited soft=4096 hard=4096\n'
}
STUB
# Change limits only in a subprocess, never in the calling shell.
bash -c 'ulimit -Sn 256; ulimit -Hn 4096; exec bash "$1"' _ \
  "$fixture/.mise/tasks/benchmark/realworld/pts/openclaw-v2" > "$fixture/result.log"
cat "$fixture/result.log"
rg -q '^OPENCLAW_FD_BEFORE soft=256 hard=4096$' "$fixture/result.log"
rg -q '^OPENCLAW_FD_AFTER soft=4096 hard=4096$' "$fixture/result.log"
rg -q '^V2 task and child inherited soft=4096 hard=4096$' "$fixture/result.log"
