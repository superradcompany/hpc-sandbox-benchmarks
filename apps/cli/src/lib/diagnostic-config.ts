export const DIAGNOSTICS = {
	"mastra-heap4096-worker1-v1": ["mastra", "test_core"],
	"openclaw-fd-hard-v1": ["openclaw", "test_unit_fast"],
	"openclaw-original-diagnostic-v1": ["openclaw", "lint_oxlint"],
} as const;
export type Diagnostic = keyof typeof DIAGNOSTICS;
export function diagnosticConfig(value: string): Diagnostic {
	if (!Object.hasOwn(DIAGNOSTICS, value)) throw new Error(`Unknown diagnostic: ${value}`);
	return value as Diagnostic;
}
export function diagnosticSandboxId(value: string): string {
	if (!/^bench-cloud-diag-[0-9]+-[0-9]+$/.test(value))
		throw new Error("Not a diagnostic sandbox ID");
	return value;
}
