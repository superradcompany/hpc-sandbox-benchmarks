# Isolated placement gate

Dispatch `bench-matrix.yml` with `placement_gate=true` to pause every newly created benchmark guest before disk probes, toolchain setup or measured commands. The default is false. Each guest waits at most 600 seconds for `/tmp/hpc-benchmark-placement-ready` containing exactly `ready`; a missing marker fails the suite and triggers normal cleanup. Waiting is untimed setup, recorded in the step log, and has a separate ten-minute allowance added to the guest lifetime and per-wave CLI budget; measured command limits and sampling remain unchanged.

For an isolated measurement, use one replica. After creation, an operator must verify the exact benchmark guest's allocation and worker, prevent new placement on that host, and restore other workers to normal scheduling. Existing unrelated jobs may finish naturally while the benchmark waits. Release requires both the scheduler allocation list and local runtime list to contain only the exact benchmark guest. Only then create the readiness marker **inside that exact guest**:

```sh
printf 'ready\n' > /tmp/hpc-benchmark-placement-ready
```

The runner then logs the release timestamp and proceeds. A marker is an operator assertion, not automatic proof of isolation; retain the allocation/host checks alongside the run artifacts. Never release a different guest or write the marker in a baked image. Restore worker scheduling only after benchmark cleanup is verified. The workflow does not change worker eligibility or any infrastructure policy itself.

Creation logs `PLACEMENT_WAIT_SANDBOX=<id>` immediately. Gated guests carry metadata `benchmark_run_id=<GitHub run ID>`, `benchmark_suite=<suite>`, and `placement_gate=true`; the Microsandbox adapter persists these as `sandbox-benchmarks.meta.*` labels in the Nomad job sandbox configuration. Match the exact run/suite labels to its allocation JobID and NodeID, then cross-check the local runtime list. Inside the guest, `/tmp/hpc-benchmark-placement-waiting` appears when the gate starts, containing its UTC timestamp. These live signals do not depend on post-job artifact upload.

Current longest suite lifetime is 90 minutes, so the optional wait requests 100 minutes; the unchanged 180-minute workflow still exceeds that plus the required 15-minute host margin. The CLI includes the wait in each serial wave when rejecting fan-outs that cannot fit the workflow budget. A failed or expired exclusivity check never releases the marker.
