import { expect, test } from "bun:test";
import type { Run, SuiteName } from "@sandbox-benchmarks/schema";
import { SUITES } from "@sandbox-benchmarks/schema";
import { missingSuiteMetrics } from "./required-suite-metrics.ts";

function shard(suite: SuiteName, omitted: string[] = []): Run {
	return {
		providers: [
			{
				providerId: "microsandbox-cloud",
				validationStatus: "validated",
				metrics: SUITES[suite].metrics
					.filter((id) => !omitted.includes(id))
					.map((metricId) => ({ metricId, samples: [1] })),
			},
		],
	} as unknown as Run;
}

test("partial Mastra success cannot hide the failed core test", () => {
	const missing = "realworld_mastra_task_test_core";
	expect(
		missingSuiteMetrics(
			shard("realworld-mastra", [missing]),
			"microsandbox-cloud",
			"realworld-mastra",
		),
	).toEqual([missing]);
});

test("every declared suite passes with complete coverage", () => {
	for (const suite of Object.keys(SUITES) as SuiteName[]) {
		expect(missingSuiteMetrics(shard(suite), "microsandbox-cloud", suite)).toEqual([]);
	}
});

test("another provider's measurements cannot satisfy this provider", () => {
	expect(missingSuiteMetrics(shard("system"), "e2b", "system")).toEqual([...SUITES.system.metrics]);
});

test("empty or nonfinite sample arrays do not count as measurements", () => {
	const run = shard("system");
	const [first, second] = run.providers[0]?.metrics ?? [];
	if (!first || !second) throw new Error("missing test fixture metrics");
	first.samples = [];
	second.samples = [NaN];
	expect(missingSuiteMetrics(run, "microsandbox-cloud", "system")).toEqual(
		SUITES.system.metrics.slice(0, 2),
	);
});

test("fio accepts either probed O_DIRECT mode but still requires every scenario and scale", () => {
	for (const mode of ["yes", "no"]) {
		const run = shard(
			"disk",
			SUITES.disk.metrics.filter((id) => id.includes(`_direct_${mode}_`)),
		);
		expect(missingSuiteMetrics(run, "microsandbox-cloud", "disk")).toEqual([]);
		const provider = run.providers[0];
		if (!provider) throw new Error("missing fixture");
		provider.metrics = provider.metrics.filter((m) => !m.metricId.includes("sequential_read"));
		expect(missingSuiteMetrics(run, "microsandbox-cloud", "disk").length).toBe(4);
	}
});
