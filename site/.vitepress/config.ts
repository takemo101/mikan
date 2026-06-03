import { defineConfig } from "vitepress";

export default defineConfig({
	title: "mikan",
	description: "Tiny local-first Issue board for AI-assisted development",
	lang: "en-US",
	base: "/mikan/",
	lastUpdated: true,
	cleanUrls: true,
	srcDir: ".",
	outDir: ".vitepress/dist",
	cacheDir: ".vitepress/cache",
	head: [["meta", { name: "theme-color", content: "#f59e0b" }]],
	themeConfig: {
		nav: [
			{ text: "Quickstart", link: "/quickstart" },
			{ text: "Install", link: "/install" },
			{ text: "CLI", link: "/cli" },
			{ text: "TUI", link: "/tui" },
			{ text: "GitHub Mirror", link: "/github-mirror" },
			{ text: "MCP & Skills", link: "/mcp-and-skills" },
			{ text: "GitHub", link: "https://github.com/takemo101/mikan" },
		],
		sidebar: {
			"/": [
				{
					text: "Getting Started",
					items: [
						{ text: "Quickstart", link: "/quickstart" },
						{ text: "Install", link: "/install" },
					],
				},
				{
					text: "Usage",
					items: [
						{ text: "CLI", link: "/cli" },
						{ text: "TUI", link: "/tui" },
						{ text: "GitHub Mirror", link: "/github-mirror" },
						{ text: "Config", link: "/config" },
					],
				},
				{
					text: "Agent Integration",
					items: [{ text: "MCP & Skills", link: "/mcp-and-skills" }],
				},
			],
		},
		socialLinks: [
			{ icon: "github", link: "https://github.com/takemo101/mikan" },
		],
		editLink: {
			pattern: "https://github.com/takemo101/mikan/edit/main/site/:path",
			text: "Edit this page on GitHub",
		},
		footer: {
			message: "Released under the MIT License.",
			copyright: "© 2026 takemo101",
		},
		search: { provider: "local" },
	},
});
