import { join } from "node:path";

// Resolve the directory holding the Vite-built Browser app shell. When the CLI
// is bundled with `bun build`, this module is inlined into `dist/bin.js`, so
// `import.meta.dir` resolves to the published `dist/` directory and the assets
// live in `dist/browser/`. See packages/cli build:dist, which copies the Vite
// output into that location.
export function packagedBrowserAssetsDir(): string {
	return join(import.meta.dir, "browser");
}
