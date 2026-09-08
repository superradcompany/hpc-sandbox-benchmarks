import { mock } from "bun:test";
import { appendFileSync } from "node:fs";

const record = (value: string) => appendFileSync("calls.txt", `${value}\n`);
const name = "bench-cloud-diag-123-1";
const sandbox = {
	sandboxId: name,
	getInfo: async () => ({
		metadata: {
			diagnostic: process.env.FOREIGN_GUEST ? "other" : "v1",
			config: process.env.DIAGNOSTIC_CONFIG,
		},
	}),
	destroy: async () => {
		record("destroy");
	},
};
mock.module("@sandbox-benchmarks/providers", () => ({
	providers: [
		{
			name: "microsandbox-cloud",
			transport: {},
			createOptions: {},
			createCompute: () => ({
				sandbox: {
					list: async () => (process.env.EXISTING_GUEST ? [sandbox] : []),
					create: async (options: { name: string; timeout: number }) => {
						record(`create:${options.name}:${options.timeout}`);
						return sandbox;
					},
					getById: async () => sandbox,
					destroy: async () => {
						record("destroyById");
					},
				},
			}),
		},
	],
}));
mock.module("@sandbox-benchmarks/harness", () => ({
	DIR: "/repo",
	setupSteps: () => [],
	StepRunner: class {
		stepLog: unknown[] = [];
		async step(label: string) {
			record(label);
			if (label === "bounded diagnostic" && process.env.TASK_FAILS) throw new Error("task failed");
			if (label === "collect diagnostic logs" && process.env.COLLECT_FAILS)
				throw new Error("collect failed");
			return { stdout: "dGVzdA==" };
		}
	},
}));
