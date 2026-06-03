import {
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { MutationError } from "./board-scan.ts";
import type { Result } from "./primitives.ts";

export function isWriteLocked(projectRoot: string): boolean {
	return existsSync(lockPath(projectRoot));
}

export function withWriteLock<T>(
	projectRoot: string,
	operation: () => Result<T, MutationError>,
): Result<T, MutationError> {
	const path = lockPath(projectRoot);
	if (existsSync(path)) {
		return {
			ok: false,
			error: { kind: "lock_held", message: "mikan write lock is held", path },
		};
	}
	mkdirSync(dirname(path), { recursive: true });
	try {
		writeFileSync(path, String(process.pid), { flag: "wx" });
	} catch {
		return {
			ok: false,
			error: { kind: "lock_held", message: "mikan write lock is held", path },
		};
	}
	try {
		return operation();
	} catch (error) {
		return {
			ok: false,
			error: {
				kind: "io_error",
				message: error instanceof Error ? error.message : String(error),
			},
		};
	} finally {
		rmSync(path, { force: true });
	}
}

export function atomicWriteFile(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = join(
		dirname(path),
		`.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
	);
	writeFileSync(tmp, content);
	renameSync(tmp, path);
}

function lockPath(projectRoot: string): string {
	return join(projectRoot, ".mikan", ".state", "write.lock");
}
