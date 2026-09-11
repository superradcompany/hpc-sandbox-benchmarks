/** One budget shared by cleanup requests and status polling. */
export class CleanupDeadline {
	private readonly expiresAt: number;

	constructor(
		private readonly sandboxId: string,
		budgetMs = 30_000,
	) {
		this.expiresAt = Date.now() + budgetMs;
	}

	/** Bound an SDK request even when its transport never settles. */
	async run<T>(operation: () => Promise<T>): Promise<T> {
		const remaining = this.expiresAt - Date.now();
		const timeout = () =>
			new Error(`Cleanup timed out for sandbox "${this.sandboxId}"; stop/removal is not confirmed`);
		if (remaining <= 0) throw timeout();
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				operation(),
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(timeout()), remaining);
				}),
			]);
		} finally {
			clearTimeout(timer);
		}
	}
}
