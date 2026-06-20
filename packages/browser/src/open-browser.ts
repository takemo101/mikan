import { spawn } from "node:child_process";

// Default, injectable browser launcher. `mikan browser` opens the local URL
// unless `--no-open` is passed; tests inject a stub so no real browser opens.
export function openBrowser(url: string): void {
	const platform = process.platform;
	try {
		if (platform === "darwin") {
			spawn("open", [url], { stdio: "ignore", detached: true }).unref();
			return;
		}
		if (platform === "win32") {
			spawn("cmd", ["/c", "start", "", url], {
				stdio: "ignore",
				detached: true,
			}).unref();
			return;
		}
		spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
	} catch {
		// Opening the browser is best-effort; the URL is always printed so the
		// user can open it manually if the platform launcher is unavailable.
	}
}
