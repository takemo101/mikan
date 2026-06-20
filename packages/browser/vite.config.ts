import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds the Browser app shell. Output goes to packages/browser/dist and is
// copied into the published CLI package under dist/browser/ at build:dist time.
// `base: "./"` keeps asset URLs relative so the Hono server can serve them from
// any port/origin.
export default defineConfig({
	base: "./",
	plugins: [react(), tailwindcss()],
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
