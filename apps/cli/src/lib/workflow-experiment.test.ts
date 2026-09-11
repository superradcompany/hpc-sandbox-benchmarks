import { expect, test } from "bun:test";
import { workflowAxes, workflowExperiment } from "./workflow-experiment.ts";

const env = {
	GITHUB_RUN_ID: "123",
	GITHUB_SHA: "a".repeat(40),
	BENCH_PROVIDERS: "daytona-vm,daytona-container,tama",
	BENCH_SUITES: "system,realworld-mastra",
};
test("workflow planning preserves samples and runs suites and replicas in parallel", () => {
	const plan = workflowExperiment(env, "2026-09-10");
	expect(plan.cells).toHaveLength(45);
	expect(plan.batches).toHaveLength(6);
	expect(workflowAxes(plan)).toEqual(["daytona", "tama"]);
	expect(plan.accounts.map((account) => account.sandboxes)).toEqual([30, 15]);
	const daytona = plan.rounds.find((round) => round.quotaDomain === "daytona");
	expect(daytona).toBeDefined();
	expect(workflowAxes(plan, "daytona", daytona?.id)).toHaveLength(4);
	expect(
		plan.cells.filter((cell) => cell.suite === "realworld-mastra").map((cell) => cell.replicate),
	).toEqual([
		...Array.from({ length: 12 }, (_, i) => i),
		...Array.from({ length: 12 }, (_, i) => i),
		...Array.from({ length: 12 }, (_, i) => i),
	]);
});
test("convergence and implicit per-cell quota overrides fail admission", () => {
	expect(() => workflowExperiment({ ...env, BENCH_SUITES: "memory" }, "2026-09-10")).toThrow(
		"convergence",
	);
	expect(() => workflowExperiment({ ...env, BENCH_MAX_CONCURRENCY: "12" }, "2026-09-10")).toThrow(
		"retired",
	);
});
test("replicas of a suite stay in one concurrent job", () => {
	const plan = workflowExperiment(
		{ ...env, BENCH_PROVIDERS: "tama", BENCH_SUITES: "system", BENCH_REPLICAS: "257" },
		"2026-09-10",
	);
	expect(plan.rounds.map((round) => round.batches.length)).toEqual([1]);
	expect(plan.cells.at(-1)?.replicate).toBe(256);
});

test("Microsandbox defaults to nine suite jobs and 54 concurrent sandboxes", () => {
	const plan = workflowExperiment(
		{ ...env, BENCH_PROVIDERS: "microsandbox-cloud", BENCH_SUITES: "", BENCH_PTS_PASSES: "2" },
		"2026-09-11",
	);
	expect(plan.cells).toHaveLength(54);
	expect(plan.batches).toHaveLength(9);
	expect(plan.batches.map((b) => b.cells.length).sort((a, b) => a - b)).toEqual([
		3, 3, 3, 3, 3, 3, 12, 12, 12,
	]);
	expect(plan.accounts[0]?.sandboxes).toBe(54);
});
test("an explicit account limit must cover concurrently running suites", () => {
	expect(() =>
		workflowExperiment(
			{ ...env, BENCH_ACCOUNT_CAPACITY: '{"daytona":{"sandboxes":12}}' },
			"2026-09-11",
		),
	).toThrow("cannot fit");
});
