import { expect, it } from "bun:test";
import { resolve } from "node:path";

it("the candidate changes exactly four commands and preserves the complete eight-task set", () => {
	const repo = resolve(import.meta.dir, "../../..");
	const base = `${repo}/packages/schema/src/pts-profiles/local/realworld-openclaw-v2-1.0.0/target.env`;
	const candidate = `${repo}/lib/pts/realworld/openclaw-v2-throttled.env`;
	const read = (override: boolean) => {
		const result = Bun.spawnSync([
			"bash",
			"-c",
			'source "$1"; if [[ "$2" == true ]]; then source "$3"; fi; set | grep "^TASK_CMD_"',
			"_",
			base,
			String(override),
			candidate,
		]);
		expect(result.exitCode).toBe(0);
		return new Map(
			result.stdout
				.toString()
				.trim()
				.split("\n")
				.map((line) => [line.slice(0, line.indexOf("=")), line]),
		);
	};
	const before = read(false);
	const after = read(true);
	expect([...after.keys()]).toEqual([...before.keys()]);
	expect(after.size).toBe(8);
	expect([...after.keys()].filter((key) => after.get(key) !== before.get(key))).toEqual([
		"TASK_CMD_lint_extensions",
		"TASK_CMD_lint_oxlint",
		"TASK_CMD_test_unit_fast",
		"TASK_CMD_typecheck",
	]);
});
