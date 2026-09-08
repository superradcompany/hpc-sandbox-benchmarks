#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { DIR, StepRunner, setupSteps } from "@sandbox-benchmarks/harness";
import { providers } from "@sandbox-benchmarks/providers";
import { SUITES } from "@sandbox-benchmarks/schema";
import { DIAGNOSTICS, diagnosticConfig, diagnosticSandboxId } from "../lib/diagnostic-config.ts";

const mode = process.env.DIAGNOSTIC_MODE;
if (!["create", "run", "cleanup"].includes(mode ?? "")) throw new Error("Invalid diagnostic mode");
const config = diagnosticConfig(process.env.DIAGNOSTIC_CONFIG ?? "");
const [suite, task] = DIAGNOSTICS[config];
const name = diagnosticSandboxId(
	mode === "create"
		? `bench-cloud-diag-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`
		: (process.env.DIAGNOSTIC_SANDBOX_ID ?? ""),
);
const provider = providers.find((p) => p.name === "microsandbox-cloud");
if (!provider) throw new Error("Provider unavailable");
const compute = provider.createCompute();
const output = "diagnostic-results";
mkdirSync(output, { recursive: true });
const manifest = {
	mode,
	config,
	name,
	harnessSha: process.env.GITHUB_SHA,
	requested: { vcpus: 4, memoryMiB: 8192, rootDiskMiB: 40960 },
	status: "pending",
};
const save = (status: string) => {
	manifest.status = status;
	writeFileSync(`${output}/${mode}-manifest.json`, JSON.stringify(manifest, null, 2));
};
save("pending");
let exitCode = 0;
try {
	if (mode === "create") {
		if (!compute.sandbox.list) throw new Error("Provider list unavailable");
		const existing = await compute.sandbox.list();
		if (existing.some((s) => s.sandboxId.startsWith("bench-cloud-diag-"))) {
			throw new Error("A diagnostic sandbox already exists; run or clean it up first");
		}
		try {
			const sandbox = await compute.sandbox.create({
				...provider.createOptions,
				name,
				timeout: 120 * 60_000,
				metadata: { diagnostic: "v1", config },
			});
			if (sandbox.sandboxId !== name) throw new Error("Unexpected sandbox ID");
			save("created-awaiting-placement-verification");
			console.log(`DIAGNOSTIC_SANDBOX_ID=${name}`);
		} catch (err) {
			await compute.sandbox.destroy(name);
			throw err;
		}
	} else {
		const sandbox = await compute.sandbox.getById(name);
		if (!sandbox) {
			if (mode === "cleanup") {
				save("already-absent");
				process.exit(0);
			}
			throw new Error("Diagnostic sandbox not found");
		}
		const info = await sandbox.getInfo();
		if (info.metadata?.diagnostic !== "v1" || info.metadata?.config !== config)
			throw new Error("Diagnostic ownership/config mismatch");
		if (mode === "cleanup") {
			await sandbox.destroy();
			save("cleaned-up");
		} else {
			const runner = new StepRunner(sandbox, provider.transport);
			try {
				for (const step of setupSteps({ ...SUITES["realworld-mastra"], setupPts: false })) {
					await runner.step(step.label, step.script, step.timeoutMs);
				}
				await runner.step(
					"install diagnostic measurement tool",
					"test -x /usr/bin/time || ($SUDO apt-get update -qq && $SUDO apt-get install -y -qq time)",
					5 * 60_000,
				);
				await runner.step(
					"bounded diagnostic",
					`cd ${DIR} && bash lib/pts/realworld/diagnostic-task.sh . ${suite} ${task} ${config}`,
					85 * 60_000,
				);
				save("diagnostic-passed");
			} finally {
				try {
					const archive = await runner.step(
						"collect diagnostic logs",
						`cd ${DIR} && mkdir -p benchmark-results && tar -czf - benchmark-results | base64 | tr -d '\\n'`,
						5 * 60_000,
						{ silent: true },
					);
					writeFileSync(`${output}/raw.tgz`, Uint8Array.fromBase64((archive.stdout ?? "").trim()));
				} finally {
					writeFileSync(`${output}/steps.json`, JSON.stringify(runner.stepLog, null, 2));
					await sandbox.destroy();
					writeFileSync(`${output}/cleanup.json`, JSON.stringify({ name, destroyed: true }));
				}
			}
		}
	}
} catch (err) {
	exitCode = 1;
	save("failed");
	console.error(err instanceof Error ? err.message : String(err));
} finally {
	process.exit(exitCode);
}
