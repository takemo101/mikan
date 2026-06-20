// Parser/helper for the `mikan browser` command's `--port` option. Keep this
// free of @mikan/browser/runtime imports so arg parsing stays adapter-light.

export type ParseBrowserPortResult =
	| { ok: true; value: number | undefined }
	| { ok: false; error: string };

// Accept only a bare integer in the valid TCP range. An exact digit pattern
// (rather than Number()) rejects loose forms like "80.0", " 80", "0x50", or
// "8e1". An omitted port means "auto-select an available local port".
const NUMERIC_PORT = /^\d+$/;

export function parseBrowserPortOption(
	raw: string | undefined,
): ParseBrowserPortResult {
	if (raw === undefined) return { ok: true, value: undefined };
	if (NUMERIC_PORT.test(raw)) {
		const port = Number(raw);
		if (port >= 1 && port <= 65535) return { ok: true, value: port };
	}
	return {
		ok: false,
		error: `Invalid --port value: ${raw}. Expected an integer between 1 and 65535.`,
	};
}
