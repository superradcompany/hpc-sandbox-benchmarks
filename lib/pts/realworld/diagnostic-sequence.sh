#!/usr/bin/env bash
# Diagnostic-only provenance. The caller owns the fixed sequence deadline and task selection.
run_diagnostic_sequence() {
  local root=$1 deadline=$2
  shift 2
  local selected remaining code started elapsed began reason status=0
  for selected in "$@"; do
    remaining=$((deadline - SECONDS))
    started=false
    elapsed=0
    if [ "$remaining" -le 0 ]; then
      code=124
      reason=sequence_budget_exhausted
    else
      started=true
      began=$SECONDS
      code=0
      timeout --kill-after=30 "$remaining" /usr/bin/time -v sh ./realworld-runner.sh "$selected" >> "$root/task.log" 2>&1 || code=$?
      elapsed=$((SECONDS - began))
      # A started exit124 may originate in the inner task timeout or outer sequence timeout.
      # Preserve the exit without inventing a cause from the code alone.
      reason=command_exit
    fi
    printf '{"task":"%s","exitCode":%s,"started":%s,"elapsedSeconds":%s,"remainingSequenceSeconds":%s,"reason":"%s"}\n' \
      "$selected" "$code" "$started" "$elapsed" "$remaining" "$reason" >> "$root/task-outcomes.jsonl" || return $?
    if [ "$code" -ne 0 ]; then status=$code; fi
  done
  return "$status"
}
