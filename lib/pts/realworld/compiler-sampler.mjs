// Diagnostic-only sampler. Never emit raw environ/cmdline or run in scored measurements.
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ENV_KEYS = new Set([
	"GOMEMLIMIT",
	"GOGC",
	"GOMAXPROCS",
	"OPENCLAW_LOCAL_CHECK",
	"OPENCLAW_LOCAL_CHECK_MODE",
	"CI",
]);
export function compilerSnapshot(procRoot = "/proc") {
	const rows = [];
	for (const pid of readdirSync(procRoot).filter((name) => /^\d+$/.test(name))) {
		try {
			const dir = `${procRoot}/${pid}`;
			const command = readFileSync(`${dir}/comm`, "utf8").trim();
			if (command !== "tsgo" && command !== "tsgolint") continue;
			const environment = {};
			for (const item of readFileSync(`${dir}/environ`, "utf8").split("\0")) {
				const at = item.indexOf("=");
				const key = item.slice(0, at);
				if (ENV_KEYS.has(key)) environment[key] = item.slice(at + 1, at + 129);
			}
			const status = readFileSync(`${dir}/status`, "utf8");
			const resources = {};
			for (const key of ["VmRSS", "VmHWM", "Threads"]) {
				const value = status.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
				if (value) resources[key] = Number(value[1]);
			}
			rows.push({
				pid: Number(pid),
				command,
				environment,
				resources,
				openDescriptors: readdirSync(`${dir}/fd`).length,
			});
		} catch {
			// A compiler may exit between proc reads; omit that incomplete sample.
		}
	}
	return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const output = process.argv[2];
	if (!output) throw new Error("diagnostic output path required");
	let samples = 0;
	const sample = () => {
		appendFileSync(
			output,
			`${JSON.stringify({ timestamp: new Date().toISOString(), compilers: compilerSnapshot() })}\n`,
		);
		if (++samples >= 2400) process.exit(0);
	};
	sample();
	setInterval(sample, 2000);
}
