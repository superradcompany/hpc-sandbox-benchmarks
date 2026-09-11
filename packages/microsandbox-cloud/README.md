# @sandbox-benchmarks/microsandbox-cloud

Owns the microsandbox-cloud driver implementation, SDK dependencies, and behavioral tests.
The fleet loader selects this package lazily; shared session mechanics live in
`@sandbox-benchmarks/driver`. SDK versions are pinned in the root catalog.

Run `bun run --filter @sandbox-benchmarks/microsandbox-cloud test` or `typecheck` from the repo root.

Recovery uses the `sandbox-benchmarks.provider=microsandbox-cloud` label. Older
`bench-cloud-<UUID>` names are recognized only when the ownership label is absent.
Inventory still scans every page for that fallback, but unrelated records are ignored
and never removed. Benchmark records remain eligible for cleanup even when stopped.

The journal retains run and attempt identity. Unknown creates, incomplete inventory,
and unconfirmed removal still block new allocations. This fork permits a shared
Microsandbox organization; unrelated workloads can compete for its quota.
