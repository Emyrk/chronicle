import cheatsheet from "./celCheatsheet.json";

/**
 * Code-mode syntax by example: [code, note]. Shown in the editor's Syntax panel and the guide.
 * The JSON is also embedded by the server (frontend/search_cheatsheet.go) for /llms.txt.
 */
export const CEL_CHEATSHEET: [string, string][] = cheatsheet as [string, string][];
