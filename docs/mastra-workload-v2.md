# Mastra workload v2

`realworld-mastra-v2-1.0.0` keeps source pin `b6eeb9d08ebeaf27bc6fd16b6b88087040aaf767`. The core-test command explicitly uses configuration `mastra-heap4096-worker1-v1`: a 4096-MiB V8 heap per process and one Vitest worker. The original profile remains available; no historical sample is rewritten as V2.

Bounded diagnostic 34186107043 on an isolated Vultr XFS host passed 738 test files, 11844 tests and typechecking. The core-test measured 911.161 seconds; the runner including build prep took 978.14 seconds. GNU time reported 3796476 KiB maximum RSS (a process maximum, not a sum across concurrent processes). This validates the configuration once; it is not a scored replica or a statistical comparison.

| V2 metric | Historical metric | Compatibility |
| --- | --- | --- |
| `realworld_mastra_v2_task_git_clone` | `realworld_mastra_task_git_clone` | Same source, command and reset |
| `realworld_mastra_v2_task_cold_install` | `realworld_mastra_task_cold_install` | Same source, command and cold reset |
| `realworld_mastra_v2_task_lint_format` | `realworld_mastra_task_lint_format` | Same source, command and prep |
| `realworld_mastra_v2_task_build_core` | `realworld_mastra_task_build_core` | Same source, command and prep |
| `realworld_mastra_v2_task_test_core` | None | Heap and worker count changed; no equivalent historical timing |

This mapping supports explicit report comparisons only. Providers' V1 results retain their original identities and are displayed as V1; moving the active headline to V2 does not manufacture V2 measurements for other providers. Placement/concurrency differences remain caveats even for compatible tasks.

The registered suite retains 12 independent replicas and one PTS pass per task, without convergence. The XML's fallback TimesToRun remains 2; the existing suite policy explicitly overrides it to 1 in CI. The test-command cap remains 1200 seconds, suite command 80 minutes, guest lifetime 90 minutes and workflow 180 minutes. The diagnostic core test uses about 15.2 minutes of the 20-minute command cap. Prior unchanged-task medians were 4.6s clone,98.0s install,202.1s lint and131.5s build; adding the validated test gives about 22.5 minutes of measured work, with initial installation, warmups, resets and prep outside those timings. Existing budgets have room based on that evidence; the full 12-replica run must still prove completion and retains its failure gates rather than truncating samples.
