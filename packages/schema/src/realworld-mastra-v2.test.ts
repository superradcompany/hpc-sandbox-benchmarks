import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { METRIC_CATALOG, SUITES } from "./index.ts";

const target = (profile: string) =>
	Object.fromEntries(
		readFileSync(
			new URL(`./pts-profiles/local/${profile}-1.0.0/target.env`, import.meta.url),
			"utf8",
		)
			.split("\n")
			.filter((line) => /^[A-Za-z_]+=/u.test(line))
			.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
	);

test("Mastra v2 preserves the compatibility boundary and historical catalog", () => {
	const original = target("realworld-mastra");
	const revised = target("realworld-mastra-v2");
	for (const key of ["REPO_URL", "PIN_SHA", "NODE_VERSION", "TASK_PREP_test_core"]) {
		expect(revised[key]).toBe(original[key]);
	}
	for (const task of ["git_clone", "cold_install", "lint_format", "build_core"]) {
		expect(revised[`TASK_CMD_${task}`]).toBe(original[`TASK_CMD_${task}`]);
	}
	expect(revised.TASK_CMD_test_core).not.toBe(original.TASK_CMD_test_core);
	expect(revised.TASK_CMD_test_core).toContain("--max-old-space-size=4096");
	expect(revised.TASK_CMD_test_core).toContain("--maxWorkers=1");
	for (const metric of SUITES["realworld-mastra"].metrics) {
		expect(metric).toStartWith("realworld_mastra_v2_");
		expect(METRIC_CATALOG.some((entry) => entry.id === metric.replace("_v2_", "_"))).toBe(true);
	}
});
