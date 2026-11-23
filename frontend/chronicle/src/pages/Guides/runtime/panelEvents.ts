// Host-owned projection. Never pass raw event objects or arbitrary processor identifiers to Lua.
/** Every instance event stream an addon can declare in project.json. Names match /events/{type}. */
export const PANEL_STREAMS = ["damage", "heal", "absorbed", "resource_change", "extra_attack", "slain", "ressurection", "cast", "spell_start",
  "spell_go", "spell_fail", "aura", "aura_cast", "dispel", "interrupt", "unit_classification", "unit_position", "unit_resources",
  "combatant_info", "consume", "raid_group"] as const
export type PanelStream = (typeof PANEL_STREAMS)[number]
/** Framed event bytes per declared stream, as /events/{type} returns them. */
export type EventStreams = Partial<Record<PanelStream, Uint8Array>>
export type PanelEvent = Readonly<{ stream: PanelStream; source: string; target: string; amount: number; offsetMs: number; encounterId: string; selected: boolean }>
/** Which encounters a panel receives: the user's selection (default) or every encounter tagged with `selected`. */
export const PANEL_STREAM_SCOPES = ["selection", "instance"] as const
export type PanelStreamScope = (typeof PANEL_STREAM_SCOPES)[number]
/**
 * How a panel behaves in the instance page's Replay mode. "full" keeps every event and reads the playhead;
 * "incremental" receives events only up to the playhead. Panels that omit it are disabled during Replay.
 */
export const PANEL_REPLAY_MODES = ["full", "incremental"] as const
export type PanelReplayMode = (typeof PANEL_REPLAY_MODES)[number]
/** project.json `replay_debounce_ms` (incremental only): how long the playhead must rest after moving back before a restart. */
export const DEFAULT_REPLAY_DEBOUNCE_MS = 250
export const MAX_REPLAY_DEBOUNCE_MS = 5000

/** Why a manifest's replay_debounce_ms is invalid, or null when it is valid (or omitted). */
export function replayDebounceError(replay: unknown, value: unknown): string | null {
  if (value === undefined) return null
  if (replay !== "incremental") return `replay_debounce_ms only applies to "replay": "incremental".`
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > MAX_REPLAY_DEBOUNCE_MS) return `replay_debounce_ms must be an integer from 0 to ${MAX_REPLAY_DEBOUNCE_MS}.`
  return null
}

export function validatePanelEvent(value: unknown, allowed: readonly PanelStream[]): PanelEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid panel event")
  const event = value as Record<string, unknown>
  if (Object.keys(event).some((key) => !["stream", "source", "target", "amount", "offsetMs", "encounterId", "selected"].includes(key)) ||
    typeof event.stream !== "string" || !allowed.includes(event.stream as PanelStream) ||
    typeof event.source !== "string" || event.source.length > 256 ||
    typeof event.target !== "string" || event.target.length > 256 ||
    typeof event.amount !== "number" || !Number.isFinite(event.amount) || Math.abs(event.amount) > 1e12 ||
    typeof event.offsetMs !== "number" || !Number.isFinite(event.offsetMs) || event.offsetMs < 0 || event.offsetMs > 1e10 ||
    typeof event.encounterId !== "string" || event.encounterId.length > 64 || typeof event.selected !== "boolean") {
    throw new Error("invalid or disallowed panel event")
  }
  return { stream: event.stream as PanelStream, source: event.source, target: event.target, amount: event.amount, offsetMs: event.offsetMs, encounterId: event.encounterId, selected: event.selected }
}
