import { useEffect, useState } from "react";

const storageKey = "mikan-browser-theme";
export type BrowserTheme = "dark" | "light";

function readStoredTheme(): BrowserTheme | undefined {
	try {
		const stored = window.localStorage.getItem(storageKey);
		return stored === "light" || stored === "dark" ? stored : undefined;
	} catch {
		return undefined;
	}
}

function getInitialTheme(): BrowserTheme {
	const stored = readStoredTheme();
	if (stored) return stored;
	try {
		return window.matchMedia?.("(prefers-color-scheme: light)").matches
			? "light"
			: "dark";
	} catch {
		return "dark";
	}
}

export function applyBrowserTheme(theme: BrowserTheme): void {
	document.documentElement.dataset.theme = theme;
	document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useBrowserTheme(): [BrowserTheme, () => void] {
	const [theme, setTheme] = useState<BrowserTheme>(getInitialTheme);

	useEffect(() => {
		applyBrowserTheme(theme);
		try {
			window.localStorage.setItem(storageKey, theme);
		} catch {
			// Ignore storage failures; the in-memory theme still applies.
		}
	}, [theme]);

	const toggleTheme = () => {
		setTheme((current) => (current === "dark" ? "light" : "dark"));
	};

	return [theme, toggleTheme];
}
