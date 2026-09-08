import { expect, it } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("normalizes PTS home separators without changing the home directory", () => {
	const fixture = mkdtempSync(join(tmpdir(), "pts-home-"));
	try {
		const runner = join(fixture, "realworld-runner.sh");
		copyFileSync(join(import.meta.dir, "../../../lib/pts/realworld/realworld-runner.sh"), runner);
		// Stop at the runner's timeout validation, before executing any benchmark or cgroup work.
		// The exit trap observes the actual startup environment received by subsequent tasks.
		writeFileSync(
			join(fixture, "target.env"),
			`REALWORLD_TASK_TIMEOUT_SECONDS=0\ntrap 'printf "%s" "$HOME"' EXIT\n`,
		);
		for (const [home, expected] of [
			[`${fixture}/`, fixture],
			[`${fixture}///`, fixture],
			[fixture, fixture],
			["/custom home/", "/custom home"],
			["/", "/"],
		] as const) {
			const result = Bun.spawnSync(["sh", runner, "unused"], {
				env: { ...process.env, HOME: home },
			});
			expect(result.exitCode).toBe(1);
			expect(result.stderr.toString()).toContain("would disable the timer");
			expect(result.stdout.toString()).toBe(expected);
		}
	} finally {
		rmSync(fixture, { recursive: true, force: true });
	}
});
