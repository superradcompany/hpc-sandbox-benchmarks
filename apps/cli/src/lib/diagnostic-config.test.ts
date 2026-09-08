import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnosticConfig, diagnosticSandboxId } from "./diagnostic-config.ts";

function invoke(mode: string, overrides: Record<string, string | undefined> = {}) {
	const dir = mkdtempSync(join(tmpdir(), "diagnostic-cli-"));
	try {
		const result = Bun.spawnSync(
			[
				process.execPath,
				"--preload",
				join(import.meta.dir, "__fixtures__/diagnostic-provider.ts"),
				join(import.meta.dir, "../bin/diagnose-microsandbox.ts"),
			],
			{
				cwd: dir,
				env: {
					...process.env,
					DIAGNOSTIC_MODE: mode,
					DIAGNOSTIC_CONFIG: "mastra-heap4096-worker1-v1",
					DIAGNOSTIC_SANDBOX_ID: "bench-cloud-diag-123-1",
					GITHUB_RUN_ID: "123",
					GITHUB_RUN_ATTEMPT: "1",
					...overrides,
				},
			},
		);
		return {
			code: result.exitCode,
			calls: existsSync(join(dir, "calls.txt")) ? readFileSync(join(dir, "calls.txt"), "utf8") : "",
			raw: existsSync(join(dir, "diagnostic-results/raw.tgz")),
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("only fixed configurations and diagnostic guest IDs are accepted", () => {
	expect(() => diagnosticConfig("arbitrary shell command")).toThrow();
	expect(() => diagnosticSandboxId("user-sandbox")).toThrow();
	expect(() => diagnosticSandboxId("bench-cloud-diag-123-1;whoami")).toThrow();
});
test.each([
	"openclaw-v2-all-fd-hard-v1",
	"openclaw-v2-all-throttled-fd-v1",
])("versioned OpenClaw sequence uses the bounded lifecycle: %s", (configuration) => {
	expect(diagnosticConfig(configuration)).toBe(configuration);
	const result = invoke("run", { DIAGNOSTIC_CONFIG: configuration });
	expect(result.code).toBe(0);
	expect(result.calls).toContain("collect diagnostic logs\ndestroy\n");
	if (configuration === "openclaw-v2-all-throttled-fd-v1")
		expect(result.calls).toContain("setupNodeVersion:24.16.0");
	else expect(result.calls).not.toContain("setupNodeVersion:");
});
test("bounded test-type compiler probe uses the normal lifecycle", () => {
	const result = invoke("run", { DIAGNOSTIC_CONFIG: "openclaw-v2-test-types-go2g-v1" });
	expect(result.code).toBe(0);
	expect(result.calls).toContain("collect diagnostic logs\ndestroy\n");
});
test("create makes exactly one bounded guest and does not execute a task", () => {
	const result = invoke("create");
	expect(result.code).toBe(0);
	expect(result.calls).toBe("create:bench-cloud-diag-123-1:7200000\n");
});
test("create refuses another guest while one exists", () => {
	const result = invoke("create", { EXISTING_GUEST: "1" });
	expect(result.code).toBe(1);
	expect(result.calls).toBe("");
});
test.each([
	{},
	{ TASK_FAILS: "1" },
	{ COLLECT_FAILS: "1" },
])("run always destroys after success or failure: %j", (override) => {
	const result = invoke("run", override);
	expect(result.code).toBe(Object.keys(override).length ? 1 : 0);
	expect(result.calls).toContain("collect diagnostic logs\ndestroy\n");
	if (!("COLLECT_FAILS" in override)) expect(result.raw).toBe(true);
});
test("ownership mismatch neither executes nor deletes a guest", () => {
	const result = invoke("run", { FOREIGN_GUEST: "1" });
	expect(result.code).toBe(1);
	expect(result.calls).toBe("");
});
