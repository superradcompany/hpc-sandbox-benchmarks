# Bounded Microsandbox diagnostics

`Diagnose Microsandbox` keeps cloud credentials in the existing `privileged` GitHub environment. It never normalizes or publishes a benchmark dataset.

1. Dispatch `mode=create` on `superrad-benchmarks` with a configuration below. This creates exactly one ephemeral 4-vCPU, 8-GiB RAM, 40-GiB disk sandbox with a 120-minute maximum lifetime. Another diagnostic guest must be cleaned up before creating one. Download `create-manifest.json` from the workflow artifact.
2. Verify its Nomad allocation is on the intended worker before proceeding. Create does not run the diagnostic workload.
3. Dispatch `mode=run` with the same configuration and sandbox ID. Setup, the selected task, artifact collection and teardown use the existing provider adapter and durable harness transport. Run always attempts cleanup; a separate workflow cleanup step retries it. Download the logs, configuration, resource measurements and cleanup evidence from the artifact, including on failure.
4. If placement is wrong or the run is abandoned, dispatch `mode=cleanup` with that ID/configuration. The maximum lifetime is a backstop, not a substitute for cleanup.

Configurations:

| ID | Workload | Explicit change |
| --- | --- | --- |
| `openclaw-v2-test-types-go2g-v1` | Complete existing V2 test-types command | Explicit Go memory target2GiB, GOGC10, GOMAXPROCS1, upstream throttled compiler policy; diagnostic-only compiler sampling |
| `openclaw-v2-all-fd-hard-v1` | All eight V2 tasks, sequentially | New upstream release and metric identities; soft FD limit raised only to existing hard limit |
| `mastra-heap4096-worker1-v1` | Existing pinned Mastra core tests, unchanged build prep | 4096-MiB V8 heap per process and one Vitest worker |
| `openclaw-fd-hard-v1` | Existing pinned OpenClaw unit-fast tests | Raise soft file-descriptor limit to its existing hard limit; log both |
| `openclaw-original-diagnostic-v1` | Existing pinned OpenClaw whole-repo lint | No workload/resource parameter changes; capture failure diagnostics |

The first two configurations are not silently comparable to historical timings. The existing runner retains its task cgroup cap and 1200-second per-command timeout. GNU time reports resource use; nonzero task exits retain their failure status and record cgroup OOM deltas. A positive delta is evidence of an OOM kill; exit 1 alone is not.

Only logs and diagnostic configuration are collected, not dependency/work trees. No image prewarming, worker eligibility changes, autoscaler changes, or full provider matrix runs are performed by this workflow.

The V2 sequence retains each task exit in `task-outcomes.jsonl`, continues after a failed task, and fails overall if any task fails. Installation is capped at 30 minutes and the complete task sequence at 50 minutes, within the lifecycle and guest TTL bounds. Tasks that cannot start before the sequence deadline are explicitly recorded with exit 124. These diagnostic timings are unscored and never replace V1 metrics.

The Go2GiB probe follows an extension-test compiler OOM after the original full core-test sequence passed. It retains the entire `pnpm check:test-types` command, including core, extension tests and root tests, and the original8GiB guest/task cap/1200-second deadline. The explicit Go settings are a hypothesis to validate, not a demonstrated fix or a hard2GiB limit. Upstream `applyThrottledGoRuntimeEnv` fills only missing Go variables, so these explicit values remain authoritative. Original diagnostic configurations and scored suites are unchanged.

Only this probe starts the compiler sampler after installation. Every2seconds, for at most80minutes, it records native `tsgo`/`tsgolint` PID, selected environment keys (`GOMEMLIMIT`, `GOGC`, `GOMAXPROCS`, `OPENCLAW_LOCAL_CHECK`, `OPENCLAW_LOCAL_CHECK_MODE`, `CI`), RSS/high-water RSS inKiB, thread count, and open descriptor count. It never emits raw environment or command lines and never runs in scored measurements. The exit trap stops/joins it before preserving logs.
