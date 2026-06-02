import type { MoveTarget } from "./selection.ts";

export type MovePromptViewModel = {
	title: string;
	focused: boolean;
	targets: (MoveTarget & { selected: boolean })[];
	hint: string;
};

export type NotePromptViewModel = {
	title: string;
	focused: boolean;
	draft: string;
	feedback?: string;
	hint: string;
};

export type ArchivePromptViewModel = {
	title: string;
	focused: boolean;
	body: string;
	hint: string;
};
