/** How a Lua panel participates in the host's built-in event filters. */
export const PANEL_FILTER_MODES = ["none", "prefilter", "manual"] as const
export type PanelFilterMode = typeof PANEL_FILTER_MODES[number]
