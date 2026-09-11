import { expect, test } from "bun:test";
import { patchParser } from "./parser-patch.mjs";

const original = `if(in_array($test_result, $avoid_duplicates)) { continue; }
$avoid_duplicates[] = $test_result;`;

test("deduplicates by unit and value, preserving the PTS same-unit filter", () => {
	const patched = patchParser(original);
	expect(patched).toContain(
		"in_array(array($tr->test_profile->get_result_scale(), $test_result), $avoid_duplicates)",
	);
	expect(patched).toContain(
		"$avoid_duplicates[] = array($tr->test_profile->get_result_scale(), $test_result);",
	);
});

test("rejects changed or ambiguous PTS code instead of silently running without the fix", () => {
	for (const source of [
		"",
		original + original,
		original.replace("$avoid_duplicates[] = $test_result;", ""),
	]) {
		expect(() => patchParser(source)).toThrow("Unsupported PTS result parser");
	}
});
