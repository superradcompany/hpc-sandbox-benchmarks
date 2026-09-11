import { expect, spyOn, test } from "bun:test";
import { type } from "arktype";
import type { GitRequest } from "./github-account-journal.ts";
import { githubAccountJournal, githubGitRequest } from "./github-account-journal.ts";

const intent = {
	version: "1",
	kind: "intent",
	account: "tama",
	attempt: "attempt-1",
	cellId: "tama-system-r0",
	planDigest: `sha256:${"a".repeat(64)}`,
} as const;
const requestTree = type({ tree: [{ path: "string", content: "string" }] });
function fixture() {
	let head = "a".repeat(40);
	let next = 1;
	const entries: Array<{ path: string; type: string; sha: string }> = [
		{ path: "journal.json", type: "blob", sha: head },
	];
	const blobs = new Map<string, string>([
		[head, JSON.stringify({ schemaVersion: "1", account: "tama", records: [] })],
	]);
	let pending: { path: string; content: string } | undefined;
	const writes: unknown[] = [];
	const request: GitRequest = async (method, path, body) => {
		if (method === "GET" && path.startsWith("/git/ref/")) return { object: { sha: head } };
		if (method === "GET" && path.startsWith("/git/commits/")) return { tree: { sha: head } };
		if (method === "GET" && path.startsWith("/git/trees/"))
			return { truncated: false, tree: entries };
		if (method === "GET" && path.startsWith("/git/blobs/"))
			return {
				encoding: "base64",
				content: Buffer.from(blobs.get(path.slice(11)) ?? "").toString("base64"),
			};
		if (method === "POST" && path === "/git/trees") {
			pending = requestTree.assert(body).tree[0];
			return { sha: "b".repeat(40) };
		}
		if (method === "POST" && path === "/git/commits")
			return { sha: (++next).toString(16).padStart(40, "0") };
		if (method === "PATCH") {
			writes.push(body);
			const update = type({ sha: "string", force: "false" }).assert(body);
			if (!pending) throw new Error("missing tree");
			head = update.sha;
			blobs.set(head, pending.content);
			entries.splice(0, entries.length, { path: pending.path, type: "blob", sha: head });
			pending = undefined;
			return { object: { sha: head } };
		}
		throw new Error("unexpected Git request");
	};
	return { request, writes };
}

test("journal survives new clients and refuses replacing an earlier immutable record", async () => {
	const f = fixture();
	await githubAccountJournal(f.request).append(intent);
	expect(await githubAccountJournal(f.request).read("tama")).toEqual([intent]);
	await expect(githubAccountJournal(f.request).append(intent)).rejects.toThrow("already exists");
	expect(f.writes).toHaveLength(1);
});
test("concurrent attempts append serially without losing records", async () => {
	const f = fixture();
	const journal = githubAccountJournal(f.request);
	await Promise.all([journal.append(intent), journal.append({ ...intent, attempt: "attempt-2" })]);
	expect(await githubAccountJournal(f.request).read("tama")).toHaveLength(2);
	expect(f.writes).toHaveLength(2);
});
test("missing journal and truncated history cannot become an empty account", async () => {
	await expect(
		githubAccountJournal(async () => {
			throw new Error("HTTP 404");
		}).read("tama"),
	).rejects.toThrow("404");
	const f = fixture();
	await expect(
		githubAccountJournal((method, path, body) =>
			path.startsWith("/git/trees/")
				? Promise.resolve({ truncated: true, tree: [] })
				: f.request(method, path, body),
		).read("tama"),
	).rejects.toThrow("incomplete");
});
test("a transient append failure does not poison later appends or reads", async () => {
	const f = fixture();
	let blip = true;
	const journal = githubAccountJournal((method, path, body) => {
		if (method === "PATCH" && blip) {
			blip = false;
			throw new Error("HTTP 502");
		}
		return f.request(method, path, body);
	});
	await expect(journal.append(intent)).rejects.toThrow("502");
	// The same client keeps working: the next cell's record lands and reads see it.
	await journal.append({ ...intent, attempt: "attempt-2" });
	expect(await journal.read("tama")).toEqual([{ ...intent, attempt: "attempt-2" }]);
	expect(f.writes).toHaveLength(1);
});
test("an unknown rejection fails without forcing the journal ref", async () => {
	const f = fixture();
	const journal = githubAccountJournal((method, path, body) => {
		if (method === "PATCH") {
			expect(body).toMatchObject({ force: false });
			throw new Error("HTTP 422");
		}
		return f.request(method, path, body);
	});
	await expect(journal.append(intent)).rejects.toThrow("422");
	await expect(journal.append({ ...intent, attempt: "attempt-2" })).rejects.toThrow("422");
});

for (const [status, message] of [
	[422, "Reference cannot be updated"],
	[422, "Update is not a fast forward"],
	[409, "Conflict"],
] as const) {
	test(`retries ${status} ${message} even when the head is unchanged`, async () => {
		const f = fixture();
		const fetch = spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response(JSON.stringify({ message }), { status }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ message }), { status }));
		try {
			const github = githubGitRequest({ GITHUB_REPOSITORY: "owner/repo", GH_TOKEN: "token" });
			let patches = 0;
			const journal = githubAccountJournal((method, path, body) => {
				if (method === "PATCH" && ++patches <= 2) {
					expect(body).toMatchObject({ force: false });
					return github(method, path, body);
				}
				return f.request(method, path, body);
			});
			await journal.append(intent);
			expect(patches).toBe(3);
			expect(await journal.read("tama")).toEqual([intent]);
			expect(f.writes).toHaveLength(1);
		} finally {
			fetch.mockRestore();
		}
	});
}

for (const [status, message] of [
	[403, "Resource not accessible by integration"],
	[422, "Validation Failed"],
] as const) {
	test(`does not retry ${status} ${message} when another writer advances the head`, async () => {
		const f = fixture();
		const other = { ...intent, attempt: "other-job" };
		const fetch = spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify({ message }), { status }),
		);
		try {
			const github = githubGitRequest({ GITHUB_REPOSITORY: "owner/repo", GH_TOKEN: "token" });
			const journal = githubAccountJournal(async (method, path, body) => {
				if (method === "PATCH") {
					await githubAccountJournal(f.request).append(other);
					return github(method, path, body);
				}
				return f.request(method, path, body);
			});
			await expect(journal.append(intent)).rejects.toThrow(message);
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(await journal.read("tama")).toEqual([other]);
		} finally {
			fetch.mockRestore();
		}
	});
}

test("journal rejection preserves GitHub's reason and request id without the token", async () => {
	const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(JSON.stringify({ message: "Update is not a fast forward: secret-token" }), {
			status: 422,
			headers: { "x-github-request-id": "test-request" },
		}),
	);
	try {
		const request = githubGitRequest({
			GITHUB_REPOSITORY: "owner/repo",
			GH_TOKEN: "secret-token",
		});
		await expect(request("PATCH", "/git/refs/heads/journal")).rejects.toThrow(
			"HTTP 422: Update is not a fast forward: [redacted] (request test-request)",
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	} finally {
		fetch.mockRestore();
	}
});

test("a competing client advances the journal and both records survive", async () => {
	const f = fixture();
	const other = { ...intent, attempt: "other-job" };
	let raced = false;
	const journal = githubAccountJournal(async (method, path, body) => {
		if (method === "PATCH" && !raced) {
			raced = true;
			await githubAccountJournal(f.request).append(other);
			throw new Error("non-fast-forward");
		}
		return f.request(method, path, body);
	});
	await journal.append(intent);
	expect(await githubAccountJournal(f.request).read("tama")).toEqual([other, intent]);
});
