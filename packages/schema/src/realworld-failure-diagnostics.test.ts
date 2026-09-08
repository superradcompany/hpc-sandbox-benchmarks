import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runner = readFileSync(
	join(import.meta.dir, "../../../lib/pts/realworld/realworld-runner.sh"),
	"utf8",
);
const body = runner.slice(
	runner.indexOf("run_bounded() {"),
	runner.indexOf("\n}", runner.indexOf("run_bounded() {")) + 2,
);

test.each([
	3, 4,
])("exit 1 preserves status and records the command OOM delta (after=%i)", (after) => {
	const dir = mkdtempSync(join(tmpdir(), "task-diagnostics-"));
	try {
		writeFileSync(join(dir, "memory.events"), "oom_kill 3\n");
		writeFileSync(join(dir, "memory.peak"), "7279562752\n");
		const result = Bun.spawnSync(
			[
				"sh",
				"-c",
				`timeout() { shift 2; "$@"; }; ${body}; run_bounded sh -c 'echo "oom_kill ${after}" > "$BENCH_CG/memory.events"; exit 1'`,
			],
			{
				env: { ...process.env, TASK: "lint_oxlint", TASK_TIMEOUT_SECONDS: "60", BENCH_CG: dir },
			},
		);
		expect(result.exitCode).toBe(1);
		const log = result.stderr.toString();
		expect(log).toContain(`memory.events oom_kill ${after}`);
		expect(log).toContain("memory.peak 7279562752");
		expect(log).toContain("nofile soft=");
		expect(log).toContain(`command oom_kill_delta ${after - 3}`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
