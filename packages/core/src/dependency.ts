import type { BoardIssue, BoardWarning } from "./board-scan.ts";
import type { IssueId } from "./primitives.ts";

export type DependencyStatus = "ready" | "blocked";

export function deriveDependencyState(
	byId: Map<string, BoardIssue[]>,
	warnings: BoardWarning[],
): void {
	for (const item of [...byId.values()].flat()) {
		const issueId = String(item.issue.id);
		const unmet = new Map<string, IssueId>();
		for (const dependency of item.issue.dependencies) {
			const dependencyId = String(dependency);
			if (dependencyId === issueId) {
				unmet.set(dependencyId, dependency);
				warnings.push({
					kind: "dependency_self",
					message: `${issueId} depends on itself`,
					issueId,
					path: item.path,
				});
				continue;
			}
			const matches = byId.get(dependencyId) ?? [];
			const target = matches[0];
			if (!target) {
				unmet.set(dependencyId, dependency);
				warnings.push({
					kind: "dependency_missing",
					message: `${issueId} depends on missing Issue ${dependencyId}`,
					issueId,
					path: item.path,
				});
				continue;
			}
			if (hasDependencyPath(dependencyId, issueId, byId)) {
				unmet.set(dependencyId, dependency);
				warnings.push({
					kind: "dependency_cycle",
					message: `${issueId} has cyclic dependency through ${dependencyId}`,
					issueId,
					path: item.path,
				});
				continue;
			}
			const targetStatus = String(target.status);
			if (targetStatus === "archived") {
				unmet.set(dependencyId, dependency);
				warnings.push({
					kind: "dependency_archived",
					message: `${issueId} depends on archived Issue ${dependencyId}`,
					issueId,
					path: item.path,
				});
				continue;
			}
			if (targetStatus !== "completed") {
				unmet.set(dependencyId, dependency);
				warnings.push({
					kind: "dependency_incomplete",
					message: `${issueId} depends on incomplete Issue ${dependencyId}`,
					issueId,
					path: item.path,
				});
			}
		}
		item.unmetDependencies = [...unmet.values()];
		item.dependencyStatus =
			item.unmetDependencies.length > 0 ? "blocked" : "ready";
	}
}

function hasDependencyPath(
	fromId: string,
	toId: string,
	byId: Map<string, BoardIssue[]>,
	seen = new Set<string>(),
): boolean {
	if (fromId === toId) return true;
	if (seen.has(fromId)) return false;
	seen.add(fromId);
	const [item] = byId.get(fromId) ?? [];
	if (!item) return false;
	return item.issue.dependencies.some((dependency) =>
		hasDependencyPath(String(dependency), toId, byId, seen),
	);
}
