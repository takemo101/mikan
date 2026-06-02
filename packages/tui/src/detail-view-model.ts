import type { BoardCardView } from "./board-view-model.ts";
import type { TuiCard } from "./model.ts";

export type DetailViewModel = {
	selected: TuiCard & {
		labelsText: string;
	};
	groups: {
		status: string;
		title: string;
		cards: BoardCardView[];
	}[];
	sections: {
		summary: string;
		statusLog: string;
		reports: string;
		notes: string;
		herdr: string;
	};
};

export type DetailPageViewModel = {
	id: string;
	title: string;
	status: string;
	labelsText: string;
	dependsOnText: string;
	unmetDependenciesText: string;
	dependencyStatus: "ready" | "blocked";
	warningCount: number;
	markdown: string;
	visibleMarkdownLines: string[];
	hiddenLinesBefore: number;
	hiddenLinesAfter: number;
	lineRangeText: string;
};

export type DetailPageOptions = {
	visibleLineCount?: number;
	viewportHeight?: number;
};
