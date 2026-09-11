import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// PTS 10.8.4 deduplicates parser results by value alone, losing equal values with different units.
export function patchParser(source) {
	const replacements = [
		[
			"if(in_array($test_result, $avoid_duplicates))",
			"if(in_array(array($tr->test_profile->get_result_scale(), $test_result), $avoid_duplicates))",
		],
		[
			"$avoid_duplicates[] = $test_result;",
			"$avoid_duplicates[] = array($tr->test_profile->get_result_scale(), $test_result);",
		],
	];
	for (const [before, after] of replacements) {
		if (source.split(before).length !== 2)
			throw new Error(
				"Unsupported PTS result parser; refusing to run fio with an unverified patch",
			);
		source = source.replace(before, after);
	}
	return source;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	writeFileSync(process.argv[3], patchParser(readFileSync(process.argv[2], "utf8")));
}
