/** Map panel option tokens (comma-separated in the panel option), for presets like Watch. */

/** Open on the whole run (the 3D replay across every encounter) instead of the 2D route overview. */
export const MAP_WHOLE_RUN_OPTION = "wr";
/** Start the page's Replay on mount at 1× (paused on the first boss pull with reduced motion). */
export const MAP_AUTOPLAY_OPTION = "ap";
/** Collapse the map's toolbar and overlays behind its gear. */
export const MAP_TOOLBAR_COLLAPSED_OPTION = "tc";

/** The Watch preset's map: whole run, playing, toolbar behind the gear. */
export const WATCH_MAP_PANEL_OPTION = [MAP_WHOLE_RUN_OPTION, MAP_AUTOPLAY_OPTION, MAP_TOOLBAR_COLLAPSED_OPTION].join(",");

export interface MapPanelOptions {
  wholeRun: boolean;
  autoplay: boolean;
  toolbarCollapsed: boolean;
}

export function parseMapPanelOptions(option: string | null | undefined): MapPanelOptions {
  const tokens = (option ?? "").split(",").map((token) => token.trim());
  return {
    wholeRun: tokens.includes(MAP_WHOLE_RUN_OPTION),
    autoplay: tokens.includes(MAP_AUTOPLAY_OPTION),
    toolbarCollapsed: tokens.includes(MAP_TOOLBAR_COLLAPSED_OPTION),
  };
}

/**
 * Where autoplay puts the Replay clock, and whether it plays: the start of
 * what the map shows, or, with reduced motion, paused on the first boss pull.
 */
export function mapAutoplayStart(
  { startMs, firstPullMs, reducedMotion }: { startMs: number; firstPullMs: number | null; reducedMotion: boolean },
): { timestampMs: number; play: boolean } {
  if (reducedMotion) return { timestampMs: firstPullMs ?? startMs, play: false };
  return { timestampMs: startMs, play: true };
}
