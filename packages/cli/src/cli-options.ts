export type CliOptions = {
	cwd?: string;
	now?: () => Date;
	home?: string;
};

export type InteractiveCommandOptions = {
	cwd?: string;
	home?: string;
	launchMcp?: () => Promise<void>;
	launchTui?: () => Promise<void>;
	launchWatch?: () => void;
};
