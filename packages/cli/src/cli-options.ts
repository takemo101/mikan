import type { TuiColumnsOption } from "./tui-options.ts";

export type CliOptions = {
	cwd?: string;
	now?: () => Date;
	home?: string;
};

export type InteractiveCommandOptions = {
	cwd?: string;
	home?: string;
	launchMcp?: () => Promise<void>;
	launchTui?: (options: { columns: TuiColumnsOption }) => Promise<void>;
	launchWatch?: () => void;
};
