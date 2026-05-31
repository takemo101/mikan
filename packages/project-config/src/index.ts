import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parseLabelId, parseProjectKey, parseStatusId } from "@mikan/core";
import { parse, stringify } from "yaml";
import { z } from "zod";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type ColumnConfig = {
	id: string;
	title: string;
};

export type LabelConfig = {
	id: string;
	title: string;
};

export type HookConfig = {
	on_enter?: Record<string, string[]>;
	on_transition?: Record<string, string[]>;
};

export type ProjectConfig = {
	project: {
		key: string;
		name: string;
	};
	board: {
		columns: ColumnConfig[];
	};
	labels: LabelConfig[];
	hooks?: HookConfig;
};

export type ProjectConfigError = {
	kind: "not_found" | "invalid_yaml" | "invalid_config" | "io_error";
	message: string;
	path?: string;
};

export type ProjectConfigLocation = {
	projectRoot: string;
	configPath: string;
};

export type LoadedProjectConfig = ProjectConfigLocation & {
	config: ProjectConfig;
};

export const DEFAULT_COLUMNS: ColumnConfig[] = [
	{ id: "backlog", title: "Backlog" },
	{ id: "ready", title: "Ready" },
	{ id: "active", title: "Active" },
	{ id: "blocked", title: "Blocked" },
	{ id: "completed", title: "Completed" },
	{ id: "archived", title: "Archived" },
];

export const DEFAULT_LABELS: LabelConfig[] = [
	{ id: "automation", title: "Automation" },
	{ id: "herdr", title: "Herdr" },
];

const nonEmptyString = z.string().min(1);

const columnSchema = z.object({
	id: nonEmptyString,
	title: nonEmptyString,
});

const labelSchema = z.object({
	id: nonEmptyString,
	title: nonEmptyString,
});

const hookSchema = z.object({
	on_enter: z.record(z.string(), z.array(z.string())).optional(),
	on_transition: z.record(z.string(), z.array(z.string())).optional(),
});

const projectConfigSchema = z
	.object({
		project: z.object({
			key: nonEmptyString,
			name: nonEmptyString,
		}),
		board: z.object({
			columns: z.array(columnSchema).min(1),
		}),
		labels: z.array(labelSchema).optional().default([]),
		hooks: hookSchema.optional(),
	})
	.superRefine((config, context) => {
		const projectKey = parseProjectKey(config.project.key);
		if (!projectKey.ok) {
			context.addIssue({
				code: "custom",
				message: projectKey.error.message,
				path: ["project", "key"],
			});
		}

		const columnIds = new Set<string>();
		for (const [index, column] of config.board.columns.entries()) {
			const parsedStatus = parseStatusId(column.id);
			if (!parsedStatus.ok) {
				context.addIssue({
					code: "custom",
					message: parsedStatus.error.message,
					path: ["board", "columns", index, "id"],
				});
			}
			if (columnIds.has(column.id)) {
				context.addIssue({
					code: "custom",
					message: `duplicate column id: ${column.id}`,
					path: ["board", "columns", index, "id"],
				});
			}
			columnIds.add(column.id);
		}

		const labelIds = new Set<string>();
		for (const [index, label] of config.labels.entries()) {
			const parsedLabel = parseLabelId(label.id);
			if (!parsedLabel.ok) {
				context.addIssue({
					code: "custom",
					message: parsedLabel.error.message,
					path: ["labels", index, "id"],
				});
			}
			if (labelIds.has(label.id)) {
				context.addIssue({
					code: "custom",
					message: `duplicate label id: ${label.id}`,
					path: ["labels", index, "id"],
				});
			}
			labelIds.add(label.id);
		}
	});

export function findProjectConfig(
	startDir = process.cwd(),
): Result<ProjectConfigLocation, ProjectConfigError> {
	let current = normalizeStartDirectory(startDir);

	while (true) {
		const configPath = join(current, ".mikan", "config.yaml");
		if (existsSync(configPath)) {
			return { ok: true, value: { projectRoot: current, configPath } };
		}

		const parent = dirname(current);
		if (parent === current) {
			return {
				ok: false,
				error: {
					kind: "not_found",
					message: "Could not find .mikan/config.yaml",
				},
			};
		}
		current = parent;
	}
}

export function loadProjectConfig(
	startDir = process.cwd(),
): Result<LoadedProjectConfig, ProjectConfigError> {
	const found = findProjectConfig(startDir);
	if (!found.ok) return found;

	let raw: string;
	try {
		raw = readFileSync(found.value.configPath, "utf8");
	} catch (error) {
		return {
			ok: false,
			error: {
				kind: "io_error",
				message: error instanceof Error ? error.message : String(error),
				path: found.value.configPath,
			},
		};
	}

	let parsed: unknown;
	try {
		parsed = parse(raw);
	} catch (error) {
		return {
			ok: false,
			error: {
				kind: "invalid_yaml",
				message: error instanceof Error ? error.message : String(error),
				path: found.value.configPath,
			},
		};
	}

	const config = projectConfigSchema.safeParse(parsed);
	if (!config.success) {
		return {
			ok: false,
			error: {
				kind: "invalid_config",
				message: config.error.issues.map(formatConfigIssue).join("; "),
				path: found.value.configPath,
			},
		};
	}

	return {
		ok: true,
		value: {
			...found.value,
			config: config.data,
		},
	};
}

export function initProject(
	projectRoot: string,
	options: { key: string; name: string },
): Result<LoadedProjectConfig, ProjectConfigError> {
	const mikanRoot = join(projectRoot, ".mikan");
	const configPath = join(mikanRoot, "config.yaml");
	const configInput = {
		project: {
			key: options.key,
			name: options.name,
		},
		board: {
			columns: cloneColumns(DEFAULT_COLUMNS),
		},
		labels: cloneLabels(DEFAULT_LABELS),
	};
	const parsedConfig = projectConfigSchema.safeParse(configInput);
	if (!parsedConfig.success) {
		return {
			ok: false,
			error: {
				kind: "invalid_config",
				message: parsedConfig.error.issues.map(formatConfigIssue).join("; "),
				path: projectRoot,
			},
		};
	}
	const config = parsedConfig.data;

	try {
		mkdirSync(mikanRoot, { recursive: true });
		for (const column of DEFAULT_COLUMNS) {
			mkdirSync(join(mikanRoot, column.id), { recursive: true });
		}
		mkdirSync(join(mikanRoot, ".state"), { recursive: true });
		mkdirSync(join(mikanRoot, "templates"), { recursive: true });
		writeFileSync(
			join(mikanRoot, "templates", "issue.md"),
			defaultIssueTemplate(),
		);
		writeFileSync(configPath, stringify(config));
	} catch (error) {
		return {
			ok: false,
			error: {
				kind: "io_error",
				message: error instanceof Error ? error.message : String(error),
				path: projectRoot,
			},
		};
	}

	return {
		ok: true,
		value: {
			projectRoot,
			configPath,
			config,
		},
	};
}

function cloneColumns(columns: ColumnConfig[]): ColumnConfig[] {
	return columns.map((column) => ({ ...column }));
}

function cloneLabels(labels: LabelConfig[]): LabelConfig[] {
	return labels.map((label) => ({ ...label }));
}

function formatConfigIssue(issue: z.core.$ZodIssue): string {
	const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
	return `${path}${issue.message}`;
}

function normalizeStartDirectory(startDir: string): string {
	if (!existsSync(startDir)) return startDir;
	return statSync(startDir).isDirectory() ? startDir : dirname(startDir);
}

function defaultIssueTemplate(): string {
	return `---\nid: {{id}}\ntitle: {{title}}\ncreated_at: {{created_at}}\nupdated_at: {{updated_at}}\n---\n\n# {{title}}\n\n## Summary\n\n## Context\n\n## Acceptance Criteria\n\n## Status Log\n\n## Reports\n\n## Notes\n`;
}
