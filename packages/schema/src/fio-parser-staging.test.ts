import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../..");
test("fio stages its corrected parser before batch-run without replacing the installed binary", () => {
	const dir = mkdtempSync(join(tmpdir(), "fio-parser-"));
	try {
		const profile = join(dir, "test-profiles/pts/fio-2.1.0");
		const installed = join(dir, "installed-tests/pts/fio-2.1.0");
		mkdirSync(profile, { recursive: true });
		mkdirSync(installed, { recursive: true });
		writeFileSync(join(profile, "results-definition.xml"), "old parser");
		writeFileSync(join(installed, "fio"), "baked binary");
		const result = Bun.spawnSync(
			[
				"bash",
				"-c",
				`
source "$REPO_ROOT/lib/bench.sh"
_configure_pts_batch() { return 0; }
pts_init() { :; }
pts_user_dir() { printf '%s' "$FIXTURE"; }
_pts_is_installed() { return 0; }
bench_cmd() {
 cmp "$REPO_ROOT/packages/schema/src/pts-profiles/fio-2.1.0/results-definition.xml" "$FIXTURE/test-profiles/pts/fio-2.1.0/results-definition.xml" || exit 41
 exit 42
}
run_pts_benchmark pts/fio-2.1.0 pts_fio-seq-read
`,
			],
			{ env: { ...process.env, REPO_ROOT: repo, FIXTURE: dir } },
		);
		expect(result.exitCode).toBe(42);
		expect(readFileSync(join(installed, "fio"), "utf8")).toBe("baked binary");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
