import type { Run, SuiteName } from "@sandbox-benchmarks/schema";
import { SUITES } from "@sandbox-benchmarks/schema";

/** Require coverage on each shard, before aggregation can conceal one replica's missing task. */
export function missingSuiteMetrics(run: Run, provider: string, suite: string): string[] {
	if (!(suite in SUITES)) throw new Error(`Unknown suite: ${suite}`);
	const measured = new Set(
		(run.providers.find((p) => p.providerId === provider)?.metrics ?? [])
			.filter((m) => m.samples.length > 0 && m.samples.every(Number.isFinite))
			.map((m) => m.metricId),
	);
	return SUITES[suite as SuiteName].metrics.filter((id) => {
		if (measured.has(id)) return false;
		// fio probes O_DIRECT support and runs exactly one of these catalogued alternatives.
		if (suite === "disk" && id.startsWith("fio_")) {
			const alternative = id.includes("_direct_yes_")
				? id.replace("_direct_yes_", "_direct_no_")
				: id.replace("_direct_no_", "_direct_yes_");
			if (measured.has(alternative)) return false;
		}
		return true;
	});
}
