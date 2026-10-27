// Host-owned projection. Never pass raw event objects or arbitrary processor identifiers to Lua.
export const PANEL_STREAMS = ["damage", "heal", "cast", "aura", "slain", "resource_change", "extra_attack"] as const
export type PanelStream = (typeof PANEL_STREAMS)[number]
export type PanelEvent = Readonly<{ stream: PanelStream; source: string; target: string; amount: number; offsetMs: number; encounterId: string; selected: boolean }>
/** Which encounters a panel receives: the user's selection (default) or every encounter tagged with `selected`. */
export const PANEL_STREAM_SCOPES = ["selection", "instance"] as const
export type PanelStreamScope = (typeof PANEL_STREAM_SCOPES)[number]

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
