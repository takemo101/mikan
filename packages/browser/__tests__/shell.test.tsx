import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register a happy-dom global environment BEFORE Testing Library is evaluated:
// @testing-library/dom binds its `screen` queries to `document.body` at module
// load, so the DOM must exist first. The dynamic imports below run after
// registration completes.
if (!(globalThis as { document?: unknown }).document) {
	GlobalRegistrator.register();
}

const { cleanup, render, screen } = await import("@testing-library/react");
const { App } = await import("../src/client/App.tsx");

afterEach(() => {
	cleanup();
});

describe("browser app shell", () => {
	test("renders the mikan browser heading", () => {
		render(<App />);
		expect(
			screen.getByRole("heading", { name: "mikan browser" }),
		).toBeDefined();
	});

	test("explains the board is not yet available", () => {
		render(<App />);
		expect(
			screen.getByText(/board loads in an upcoming release/i),
		).toBeDefined();
	});
});
