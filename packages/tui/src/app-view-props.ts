import type { TuiModel } from "./model.ts";
import type { TuiSelection } from "./selection.ts";
import type { TuiTheme } from "./theme.ts";

// Visible board Column mode. "auto" derives the count from viewport width and
// keeps the sliding viewport; a number requests an explicit fixed count. Kept
// free of CLI imports so `@mikan/cli`'s TuiColumnsOption stays assignable here.
export type TuiColumnsMode = "auto" | number;

// Shared props contract for the top-level OpenTUI view components (board page,
// detail page, modal prompts). Lives in a leaf Module so the rendering
// component Modules and the index facade can all depend on it without a cycle.
export type TuiAppViewProps = {
	model: TuiModel;
	selection: TuiSelection;
	theme?: TuiTheme;
	viewportHeight?: number;
	viewportWidth?: number;
	columns?: TuiColumnsMode;
};
