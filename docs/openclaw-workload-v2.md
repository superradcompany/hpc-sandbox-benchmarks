# OpenClaw workload v2

The original profile pins commit `623534400684eca7c451cf587189fae714f2abe2`. Its shrinkwrap check fails against a clean checkout. The later release commit `dba64d574f675f66397bfd3469e1edb4aa3fa88f` and final pre-removal commit `e935a008f82f029b717c201e2f3f37e21e84b1af` also failed the unmodified root check during this investigation.

Upstream commit `f6131a4fbfa5a7779ae3f2663ba927935d944ce3` removed shrinkwrap support and replaced it with npm package-lock validation. V2 pins release **2026.9.2**, commit `3928bad9badfcb6c7d140530435e806fb8092190`, and uses upstream's actual `pnpm deps:npm-lock:check` command. It does not generate a tracked shrinkwrap merely to make a subsequent check pass.

Every V2 task has a separate `realworld_openclaw_v2_*` metric identity, including `realworld_openclaw_v2_task_npm_package_lock_check`. The original profile and all original catalog entries remain intact. No V2 timing is an equivalent historical V1 sample: the source changed, `tsgo:prod` now includes UI, the extension lint entry changed, and test membership changed.

This profile is prepared for validation and **is not selected by the current benchmark suite**. The lock-check command passed locally for all 94 package locks on Node22. The other tasks still require bounded sandbox validation before the default suite can switch. The original missing shrinkwrap metric remains a failure; it is not relabeled as a successful lock check.

V2 uses a profile-local Corepack shim to run its exact pinned pnpm12.1.0. The ambient pnpm10 launcher installs that version without the required native-binary bootstrap and fails with a shell syntax error before dependency installation. A Linux regression fixture reproduces that failure, then verifies the unmodified pinned version through Corepack, including a frozen install after the normal cold-cache reset. The shim and package-manager cache sit outside the dependency caches that cold_install clears; workload source, lockfile and package-manager version are unchanged. Other profiles keep their existing launcher.
