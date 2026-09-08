// Run with Node22 --experimental-strip-types and the pinned, dependency-installed upstream checkout.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const checkout = path.resolve(process.argv[2]);
assert.equal(
	execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
	"3928bad9badfcb6c7d140530435e806fb8092190",
);
const load = (file) => import(pathToFileURL(path.join(checkout, file)).href);
// Connect the configured command to the actual module being audited. Importing the
// right module alone does not catch a misspelled entrypoint in the shell command.
const commandFile = new URL("../realworld/openclaw-v2-throttled.env", import.meta.url);
const extensionCommand = execFileSync(
	"bash",
	["-c", 'source "$1"; printf "%s" "$TASK_CMD_lint_extensions"', "audit", commandFile.pathname],
	{ encoding: "utf8" },
).trim();
assert.equal(
	extensionCommand,
	"OPENCLAW_LOCAL_CHECK=1 OPENCLAW_LOCAL_CHECK_MODE=throttled node --import ./scripts/tsx.mjs scripts/run-oxlint-shards.mts --only=extensions",
);
for (const entrypoint of ["scripts/tsx.mjs", "scripts/run-oxlint-shards.mts"])
	assert.ok(fs.statSync(path.join(checkout, entrypoint)).isFile());
const { createOxlintShards, filterOxlintShards, parseShardRunnerArgs } = await load(
	"scripts/run-oxlint-shards.mts",
);
assert.deepEqual([...parseShardRunnerArgs(["--only=extensions"]).only], ["extensions"]);
// Reach the real CLI argument parser without starting a compiler or changing the checkout.
const launcher = spawnSync(
	process.execPath,
	["--import", "./scripts/tsx.mjs", "scripts/run-oxlint-shards.mts", "--only"],
	{ cwd: checkout, encoding: "utf8", timeout: 30_000 },
);
assert.equal(launcher.status, 1, launcher.stderr);
assert.match(launcher.stderr, /--only requires a shard name/);
const { applyLocalTsgoPolicy, applyLocalOxlintPolicy } = await load(
	"scripts/lib/local-check-runtime.mts",
);
const { resolveLocalVitestScheduling } = await load("scripts/lib/vitest-local-scheduling.mts");
const hostResources = { logicalCpuCount: 4, totalMemoryBytes: 8 * 1024 ** 3 };
const before = { CI: "true", OPENCLAW_LOCAL_CHECK: "0" };
const after = { CI: "true", OPENCLAW_LOCAL_CHECK: "1", OPENCLAW_LOCAL_CHECK_MODE: "throttled" };
const baseline = createOxlintShards({ cwd: checkout, env: before, hostResources });
const candidate = createOxlintShards({ cwd: checkout, env: after, hostResources });
assert.deepEqual(candidate, baseline);
const extensions = filterOxlintShards(candidate, new Set(["extensions"]));
const actual = extensions.flatMap((shard) => shard.args.slice(2)).sort();
const expected = fs
	.readdirSync(path.join(checkout, "extensions"), { withFileTypes: true })
	.filter((entry) => entry.isDirectory() || (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)))
	.map((entry) => `extensions/${entry.name}`)
	.sort();
assert.deepEqual(actual, expected);
assert.equal(new Set(actual).size, actual.length);
for (const shard of extensions)
	assert.deepEqual(shard.args.slice(0, 2), ["--tsconfig", "extensions/tsconfig.json"]);
for (const project of [
	"tsconfig.core.json",
	"tsconfig.ui.json",
	"tsconfig.extensions.json",
	"packages/plugin-sdk/tsconfig.json",
]) {
	const args = [
		"-p",
		project,
		"--incremental",
		"--tsBuildInfoFile",
		".artifacts/check.tsbuildinfo",
	];
	if (project.startsWith("packages/")) args.push("--declaration", "--emitDeclarationOnly");
	const original = applyLocalTsgoPolicy(args, before, hostResources);
	const changed = applyLocalTsgoPolicy(args, after, hostResources);
	assert.deepEqual(
		changed.args.filter(
			(arg, index) =>
				arg !== "--singleThreaded" &&
				arg !== "--checkers" &&
				changed.args[index - 1] !== "--checkers",
		),
		original.args,
	);
	assert.equal(changed.env.GOMEMLIMIT, "3GiB");
	assert.equal(changed.env.GOMAXPROCS, "2");
	assert.equal(changed.env.GOGC, "30");
}
const lintArgs = ["--tsconfig", "extensions/tsconfig.json", "extensions"];
assert.deepEqual(
	applyLocalOxlintPolicy(lintArgs, before, hostResources).args,
	applyLocalOxlintPolicy(lintArgs, after, hostResources).args,
);
assert.deepEqual(resolveLocalVitestScheduling({ OPENCLAW_VITEST_MAX_WORKERS: "1" }), {
	maxWorkers: 1,
	fileParallelism: false,
	throttledBySystem: false,
});
console.log(
	JSON.stringify({
		sameWholeLintMembership: true,
		fullLintShards: candidate.length,
		extensionShards: extensions.length,
		extensionTargetsExactlyOnce: actual.length,
		compilerProjectsAndOptionsPreserved: true,
		oneVitestWorkerWithoutFileParallelism: true,
	}),
);
