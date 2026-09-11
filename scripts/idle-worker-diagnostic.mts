import { executeSuite } from "@sandbox-benchmarks/harness";
import { TARGET_SPEC } from "@sandbox-benchmarks/schema";
import { confirmRemoval } from "../apps/cli/src/lib/account-journal.ts";
import { openDriver } from "../apps/cli/src/lib/driver-run.ts";

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}
const repo = requiredEnv("GITHUB_REPOSITORY");
const sha = requiredEnv("GITHUB_SHA");
const run = requiredEnv("GITHUB_RUN_ID");
const token = requiredEnv("GITHUB_TOKEN");
async function github(path: string, body?: unknown) {
	const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
		method: body ? "POST" : "GET",
		signal: AbortSignal.timeout(20_000),
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	if (!response.ok) throw new Error(`Diagnostic gate HTTP ${response.status}`);
	return response.json();
}
for (const [index, suiteName] of (["realworld-better-auth", "cpu-node"] as const).entries()) {
	const opened = await openDriver("microsandbox-cloud");
	let ref: { provider: "microsandbox-cloud"; id: string } | undefined;
	try {
		await executeSuite({
			allocation: {
				module: opened.module,
				driver: {
					...opened.driver,
					create: async (request, options) => {
						const session = await opened.driver.create(request, options);
						ref = { provider: "microsandbox-cloud", id: session.sandboxRef.id };
						await github(`/statuses/${sha}`, {
							state: "pending",
							context: `idle-ready-${run}-${index}`,
							description: ref.id,
						});
						console.log("DIAGNOSTIC_READY", JSON.stringify({ index, suiteName, ref }));
						const deadline = Date.now() + 10 * 60_000;
						while (Date.now() < deadline) {
							const statuses = await github(`/commits/${sha}/statuses?per_page=100`);
							const gate = statuses.find(
								(s: { context: string }) => s.context === `idle-go-${run}-${index}`,
							);
							if (gate?.state === "success") return session;
							if (gate?.state === "failure") throw new Error("Operator rejected worker placement");
							await Bun.sleep(3000);
						}
						throw new Error("Worker isolation gate timed out");
					},
				},
				request: { spec: TARGET_SPEC, artifact: opened.artifact },
			},
			runId: `idle-${run}-${index}`,
			suiteName,
			resultsDir: `diagnostic-results/${index}`,
		});
	} finally {
		if (ref) {
			await confirmRemoval(opened.driver, ref, AbortSignal.timeout(120_000));
			await github(`/statuses/${sha}`, {
				state: "success",
				context: `idle-done-${run}-${index}`,
				description: "Diagnostic sandbox cleanup verified",
			});
		}
	}
}
