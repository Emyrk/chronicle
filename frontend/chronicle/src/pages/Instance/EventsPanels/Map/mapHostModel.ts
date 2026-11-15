/**
 * The Map panel's hosts as data (pure, tested): which chrome each host turns
 * on, when the map plays its own preview, and the small rules the hosts share.
 * A host is a kind (mini, full, mobile) plus its live state (immersive, i.e.
 * fullscreen or filling the window); the mini map expanded is the full map.
 */

import type { DungeonMeshState } from "./MapScene3D";

export type MapHostKind = "mini" | "full" | "mobile";

/** What a host turns on. Each flag replaces a `mini` / `mobile` check in the shared code. */
export interface MapHostCapabilities {
  /** The card's padding and thin window frame (the full map, inline). */
  framed: boolean;
  /** The title-row controls (presence, Render video, Overview, Expand). */
  header: boolean;
  /** The bottom-left camera row: Follow or Fit, Reset, the floor picker. */
  framing: boolean;
  /** Play/pause and speed lead the camera row even with the page's Replay on. */
  playback: boolean;
  /** The mini map's Expand (title row and corner). */
  expand: boolean;
  /** The mini map's scrubber. */
  scrubber: boolean;
  /** The mini map's preview veil, Preview tag and "Replay from here". */
  previewVeil: boolean;
  /** "Render video" in the title row. */
  video: boolean;
  /** The stage's status chips (final positions, the preview's "Replay from here") and the camera-key hints. */
  hints: boolean;
  /** Raid, enemy and target frames, and the inspect cards. */
  frames: boolean;
  settings: boolean;
  walk: boolean;
  plan: boolean;
  /** The floating meter windows. */
  meters: boolean;
  /** Fill-window and fullscreen buttons and their shortcuts. */
  fullscreen: boolean;
  /** While immersive: the encounter picker and the page's Replay bar over the map. */
  immersiveChrome: boolean;
  /** The whole run's encounter bar under the map. */
  jumps: boolean;
  /** The WebGL and coordinate-mapping notes under the map. */
  notes: boolean;
  /** Live-session presence: others' cameras on the map. */
  presence: boolean;
  /** The N/S compass dial. */
  compass: boolean;
  /** Pointer and keyboard input on the 3D view. */
  interactive: boolean;
  /** "Enter 3D world": the inert 2D preview that opens the 3D world fullscreen, with touch controls. */
  mobileWorld: boolean;
}

/**
 * The chrome a host shows. The mini map is just the replay (play, scrubber,
 * Expand); expanded it is the full map. Mobile shows the replay alone and
 * opens it fullscreen with touch controls.
 */
export function mapHostCapabilities(kind: MapHostKind, immersive: boolean): MapHostCapabilities {
  const compact = kind === "mini" && !immersive;
  const mobile = kind === "mobile";
  const full = !compact && !mobile;
  return {
    framed: kind === "full" && !immersive,
    header: !mobile,
    framing: !mobile,
    playback: compact,
    expand: compact,
    scrubber: compact,
    previewVeil: compact,
    video: full,
    hints: full,
    frames: full,
    settings: full,
    walk: full,
    plan: full,
    meters: full,
    fullscreen: full,
    immersiveChrome: full && immersive,
    jumps: full,
    notes: full,
    presence: true,
    compass: true,
    interactive: true,
    mobileWorld: mobile,
  };
}

/**
 * The map plays on a loop by its own clock (the preview) while the page's
 * Replay is off, wherever it is not just a still: the mini and mobile maps,
 * the whole run and any fullscreen map. It never turns Replay on.
 */
export function mapPreviewOn(kind: MapHostKind, options: { wholeRun: boolean; immersive: boolean; replayOn: boolean }): boolean {
  return (kind === "mini" || kind === "mobile" || options.wholeRun || options.immersive) && !options.replayOn;
}

/** A whole raid in the 90-second preview can hit 32×, unreadably jumpy on a phone: mobile whole runs cap at 4×. */
export function mapPreviewMaxSpeed(kind: MapHostKind, wholeRun: boolean): number | undefined {
  return kind === "mobile" && wholeRun ? 4 : undefined;
}

/** The Map panel option that made it a mini map before the Mini Map panel; still honoured for saved layouts and links. */
const MINI_MAP_PANEL_OPTION = "mini";

/** The panel option asks for the mini map: the replay without overlays, for small panels. */
export function isMiniMapOption(option: string | null | undefined): boolean {
  return (option ?? "").split(",").includes(MINI_MAP_PANEL_OPTION);
}

export function preferredMeshState(stored: boolean | null): boolean {
  return stored ?? true;
}

export function alignmentOverlayForMapMode(requested: boolean, meshWanted: boolean): boolean {
  return requested && meshWanted;
}

export function walkModeAvailable(
  show3D: boolean,
  meshWanted: boolean,
  meshState: DungeonMeshState,
  flatYardsAvailable: boolean,
): boolean {
  return show3D && (meshWanted ? meshState === "ready" : flatYardsAvailable);
}

export function mapOwnsPortalContainer(fullscreen: boolean, windowed: boolean, mobileWorldOpen: boolean): boolean {
  return fullscreen || windowed || mobileWorldOpen;
}
