import {
	type BoardViewModel,
	buildBoardViewModel,
	scanBoard,
} from "@mikan/core";
import { loadProjectConfig } from "@mikan/project-config";
import { type ApiError, mapConfigError } from "./config-error.ts";

// Read-only Board API for `GET /api/board`.
//
// Each call reloads the current project config and Board Snapshot from disk so
// changes made by the CLI, MCP, TUI, or agents become visible without a
// watcher or daemon, then projects them through the shared `BoardViewModel`.
// User-fixable config/core errors are mapped to a stable `{ ok: false, error:
// { code, message } }` envelope. This module never writes to the project.

export type BoardApiError = ApiError;

export type BoardApiProject = {
	key: string;
	name: string;
	root: string;
};

export type BoardApiResponse =
	| { ok: true; project: BoardApiProject; board: BoardViewModel }
	| { ok: false; error: BoardApiError };

export function loadBoardApiResponse(cwd: string): BoardApiResponse {
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) {
		return { ok: false, error: mapConfigError(loaded.error) };
	}
	const board = scanBoard({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
	});
	if (!board.ok) {
		return {
			ok: false,
			error: { code: board.error.kind, message: board.error.message },
		};
	}
	const view = buildBoardViewModel(
		board.value,
		loaded.value.config.labels,
		loaded.value.config.github?.repo,
		loaded.value.config.repositories,
	);
	return {
		ok: true,
		project: {
			key: loaded.value.config.project.key,
			name: loaded.value.config.project.name,
			root: loaded.value.projectRoot,
		},
		board: view,
	};
}
