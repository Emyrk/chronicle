import type { AlignMode, TimelineMetric } from "../../EventsPanels/RotationTimeline/derive";

/**
 * Player Timeline view state saved in share links (layout.pageState).
 * Icon size and ignored spells are per-viewer preferences in localStorage.
 */
export interface PlayerTimelineState {
  /** Encounter the window, pin and debuff target belong to. */
  encounterId: string;
  /** Player A and B GUIDs; B is null for "None". */
  players: [string | null, string | null];
  align: AlignMode;
  /** Damage (DPS) or healing (HPS) view. */
  metric: TimelineMetric;
  /** Visible window, or null for the whole fight. */
  window: { startMs: number; endMs: number } | null;
  pinnedMs: number | null;
  follow: boolean;
  debuffTarget: string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const guid = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Validate untrusted share-link state; invalid fields fall back to defaults. */
export function parsePlayerTimelineState(raw: unknown): PlayerTimelineState | null {
  if (!isObject(raw) || typeof raw.encounterId !== "string") return null;
  const players: [string | null, string | null] = Array.isArray(raw.players)
    ? [guid(raw.players[0]), guid(raw.players[1])]
    : [null, null];
  const w = raw.window;
  const window =
    isObject(w) && finite(w.startMs) && finite(w.endMs) && w.startMs >= 0 && w.endMs > w.startMs
      ? { startMs: w.startMs, endMs: w.endMs }
      : null;
  return {
    encounterId: raw.encounterId,
    players,
    align: raw.align === "first_cast" ? "first_cast" : "pull",
    metric: raw.metric === "healing" ? "healing" : "damage",
    window,
    pinnedMs: finite(raw.pinnedMs) && raw.pinnedMs >= 0 ? raw.pinnedMs : null,
    follow: raw.follow === true,
    debuffTarget: guid(raw.debuffTarget),
  };
}
