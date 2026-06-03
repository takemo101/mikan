export type CliResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export function ok(stdout: string): CliResult {
	return { exitCode: 0, stdout, stderr: "" };
}

export function fail(stderr: string): CliResult {
	return { exitCode: 1, stdout: "", stderr: `${stderr}\n` };
}
