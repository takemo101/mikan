import type { ProjectConfigError } from "@mikan/project-config";

// Shared API error envelope shape and project-config error mapping.
//
// Both the read-only Board API (`GET /api/board`) and the Issue detail API
// (`GET /api/issues/:id`) surface failures through the same
// `{ ok: false, error: { code, message } }` envelope, mapping user-fixable
// config-loading failures to stable, user-facing codes.

export type ApiError = {
	code: string;
	message: string;
};

export function mapConfigError(error: ProjectConfigError): ApiError {
	return { code: configErrorCode(error.kind), message: error.message };
}

function configErrorCode(kind: ProjectConfigError["kind"]): string {
	switch (kind) {
		case "not_found":
			return "config_not_found";
		case "invalid_yaml":
		case "invalid_config":
			return "invalid_config";
		case "io_error":
			return "io_error";
	}
}
