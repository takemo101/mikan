import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register a happy-dom global environment BEFORE Testing Library is evaluated:
// @testing-library/dom binds its `screen` queries to `document.body` at module
// load, so the DOM must exist first. The dynamic imports below run after
// registration completes.
if (!(globalThis as { document?: unknown }).document) {
	GlobalRegistrator.register();
}

const { QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, render, screen } = await import("@testing-library/react");
const { App } = await import("../src/client/App.tsx");
const { createBrowserQueryClient } = await import(
	"../src/client/board-query.ts"
);

const originalFetch = globalThis.fetch;

beforeEach(() => {
	// The app polls /api/board on mount; keep the request pending so the shell
	// renders its loading state deterministically.
	globalThis.fetch = (() => new Promise(() => {})) as unknown as typeof fetch;
});

afterEach(() => {
	cleanup();
	globalThis.fetch = originalFetch;
});

function renderApp() {
	const client = createBrowserQueryClient();
	render(
		<QueryClientProvider client={client}>
			<App />
		</QueryClientProvider>,
	);
}

describe("browser app shell", () => {
	test("renders the mikan browser heading", () => {
		renderApp();
		expect(
			screen.getByRole("heading", { name: "mikan browser" }),
		).toBeDefined();
	});

	test("shows the board polling loading state before data arrives", () => {
		renderApp();
		expect(screen.getByTestId("board-status").textContent).toContain(
			"Loading board",
		);
	});
});
