import type { ApiError } from "./config-error.ts";

// Host/Origin guard for Browser write endpoints.
//
// `mikan browser` binds to loopback only, but a write endpoint still needs a
// small CSRF/DNS-rebinding guard: a malicious web page must not be able to drive
// local mutations through the user's browser. This helper is intentionally tiny
// and reusable across write endpoints (append now, move in MIK-155).
//
// Two checks, both derived from the request the server actually received:
//   1. The request's own host must be a loopback literal. Bun builds the request
//      URL from the `Host` header, so a DNS-rebinding `Host: evil.example` is
//      rejected here.
//   2. If an `Origin` header is present (browsers always send it on POST), its
//      origin must equal the server origin. A cross-site form post carries the
//      attacker page's Origin and is rejected; same-origin app posts match.
// Non-browser clients (curl) omit Origin and pass on the loopback check alone.

export type OriginGuardResult = { ok: true } | { ok: false; error: ApiError };

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function rejected(message: string): OriginGuardResult {
	return { ok: false, error: { code: "forbidden_origin", message } };
}

export function checkWriteOrigin(request: Request): OriginGuardResult {
	let url: URL;
	try {
		url = new URL(request.url);
	} catch {
		return rejected("Request URL is not a valid local origin.");
	}
	if (!LOOPBACK_HOSTNAMES.has(url.hostname)) {
		return rejected(`Host ${url.host} is not the local mikan browser origin.`);
	}
	const origin = request.headers.get("origin");
	if (origin !== null && origin !== "") {
		let originUrl: URL;
		try {
			originUrl = new URL(origin);
		} catch {
			return rejected(`Origin ${origin} is not a valid origin.`);
		}
		if (originUrl.origin !== url.origin) {
			return rejected(
				`Origin ${originUrl.origin} does not match the local mikan browser origin ${url.origin}.`,
			);
		}
	}
	return { ok: true };
}
