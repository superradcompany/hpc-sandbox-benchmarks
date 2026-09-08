import { expect, it } from "bun:test";
import { resolve } from "node:path";

it("the OpenClaw V2 entrypoint raises only soft FD limits for the workload and children", () => {
	const repo = resolve(import.meta.dir, "../../..");
	const result = Bun.spawnSync(["bash", `${repo}/lib/pts/tests/openclaw-fd-entrypoint.sh`, repo]);
	expect(result.exitCode).toBe(0);
	expect(result.stdout.toString()).toContain("OPENCLAW_FD_BEFORE soft=256 hard=4096");
	expect(result.stdout.toString()).toContain("OPENCLAW_FD_AFTER soft=4096 hard=4096");
	expect(result.stdout.toString()).toContain("V2 task and child inherited soft=4096 hard=4096");
});
