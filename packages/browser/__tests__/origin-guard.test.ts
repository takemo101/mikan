import { describe, expect, test } from "bun:test";
import { checkWriteOrigin } from "../src/index.ts";

// The guard only reads `request.url` and `request.headers.get("origin")`. These
// tests build a minimal stand-in rather than a real `Request` so the forbidden
// `Origin` header is never stripped by a browser-like global (happy-dom), keeping
// the cross-origin assertions deterministic regardless of test file ordering.
function fakeRequest(url: string, origin?: string | null): Request {
	return {
		url,
		headers: {
			get: (name: string) =>
				name.toLowerCase() === "origin" ? (origin ?? null) : null,
		},
	} as unknown as Request;
}

const APPEND_URL = "http://127.0.0.1/api/issues/MIK-001/append";

describe("checkWriteOrigin", () => {
	test("allows a same-origin loopback request", () => {
		const result = checkWriteOrigin(
			fakeRequest(APPEND_URL, "http://127.0.0.1"),
		);
		expect(result.ok).toBe(true);
	});

	test("allows a loopback request that omits Origin (non-browser client)", () => {
		const result = checkWriteOrigin(fakeRequest(APPEND_URL, null));
		expect(result.ok).toBe(true);
	});

	test("allows localhost with a matching Origin and port", () => {
		const result = checkWriteOrigin(
			fakeRequest(
				"http://localhost:4321/api/issues/MIK-001/append",
				"http://localhost:4321",
			),
		);
		expect(result.ok).toBe(true);
	});

	test("rejects a cross-site Origin", () => {
		const result = checkWriteOrigin(
			fakeRequest(APPEND_URL, "http://evil.example"),
		);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected rejection");
		expect(result.error.code).toBe("forbidden_origin");
	});

	test("rejects a matching host but mismatched Origin port", () => {
		const result = checkWriteOrigin(
			fakeRequest(
				"http://127.0.0.1:4321/api/issues/MIK-001/append",
				"http://127.0.0.1:5000",
			),
		);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected rejection");
		expect(result.error.code).toBe("forbidden_origin");
	});

	test("rejects a non-loopback Host (DNS rebinding)", () => {
		const result = checkWriteOrigin(
			fakeRequest("http://evil.example/api/issues/MIK-001/append", null),
		);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected rejection");
		expect(result.error.code).toBe("forbidden_origin");
	});

	test("rejects a malformed Origin header", () => {
		const result = checkWriteOrigin(fakeRequest(APPEND_URL, "not a url"));
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected rejection");
		expect(result.error.code).toBe("forbidden_origin");
	});
});
