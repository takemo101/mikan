export type TuiTheme = {
	base: {
		canvas: string;
		surface: string;
		text: string;
		muted: string;
	};
	interactive: {
		accent: string;
		focus: string;
		selectedSurface: string;
	};
	feedback: {
		warning: string;
		error: string;
		success: string;
	};
};

export function buildTuiTheme(): TuiTheme {
	return {
		base: {
			canvas: "#1f1a14",
			surface: "#2a2118",
			text: "#eadfce",
			muted: "#9c8870",
		},
		interactive: {
			accent: "#f0a04b",
			focus: "#f6c177",
			selectedSurface: "#3a2a1d",
		},
		feedback: {
			warning: "#f6c177",
			error: "#d66a4a",
			success: "#8faa5f",
		},
	};
}
