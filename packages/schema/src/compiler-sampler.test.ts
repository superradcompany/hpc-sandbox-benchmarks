import { expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

it("compiler diagnostics emit only allowed environment keys and selected resources", async () => {
	const { compilerSnapshot } = await import(
		pathToFileURL(join(import.meta.dir, "../../../lib/pts/realworld/compiler-sampler.mjs")).href
	);
	const root = mkdtempSync(join(tmpdir(), "compiler-proc-"));
	try {
		for (const [pid, command] of [
			["123", "tsgo"],
			["456", "node"],
		] as const) {
			mkdirSync(join(root, pid, "fd"), { recursive: true });
			writeFileSync(join(root, pid, "comm"), `${command}\n`);
			writeFileSync(
				join(root, pid, "environ"),
				"GOMEMLIMIT=2GiB\0GOGC=10\0GOMAXPROCS=1\0MSB_API_KEY=never-emit-this\0OTHER_SECRET=hidden\0",
			);
			writeFileSync(join(root, pid, "status"), "VmRSS:\t1024 kB\nVmHWM:\t2048 kB\nThreads:\t2\n");
			writeFileSync(join(root, pid, "fd", "0"), "");
		}
		mkdirSync(join(root, "789")); // A process disappearing mid-read is harmless.
		const result = compilerSnapshot(root);
		expect(result).toEqual([
			{
				pid: 123,
				command: "tsgo",
				environment: { GOMEMLIMIT: "2GiB", GOGC: "10", GOMAXPROCS: "1" },
				resources: { VmRSS: 1024, VmHWM: 2048, Threads: 2 },
				openDescriptors: 1,
			},
		]);
		expect(JSON.stringify(result)).not.toContain("never-emit-this");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
