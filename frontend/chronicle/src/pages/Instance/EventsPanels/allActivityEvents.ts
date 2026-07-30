import type { StreamType } from "@/hooks/instanceEvents";
import type { AllActivityState, RawDebugEvent } from "./processors";

export const ALL_ACTIVITY_STREAMS: StreamType[] = [
  "damage", "heal", "resource_change", "extra_attack", "slain", "ressurection",
  "aura", "spell_go", "aura_cast", "spell_start", "spell_fail",
  "unit_classification", "combatant_info", "dispel", "interrupt", "absorbed", "consume",
];

export const STREAM_TYPE_CODES: Record<StreamType, string> = {
  damage: "DMG",
  heal: "HEAL",
  resource_change: "RES",
  extra_attack: "XATK",
  slain: "DEAD",
  ressurection: "REZ",
  cast: "CAST",
  aura: "AURA",
  spell_go: "GO",
  aura_cast: "ACST",
  spell_start: "START",
  spell_fail: "FAIL",
  unit_classification: "CLASS",
  combatant_info: "INFO",
  dispel: "DSP",
  interrupt: "INT",
  absorbed: "ABS",
  companion_stats: "STAT",
  consume: "CONS",
};

export function collectAllActivityEvents(
  rawEventsByStream: AllActivityState["rawEventsByStream"],
): RawDebugEvent[] {
  return ALL_ACTIVITY_STREAMS.flatMap((stream) => rawEventsByStream[stream]);
}

export function damageTrailerSummary(event: RawDebugEvent): string | null {
  if (!event.damageTrailers?.length) return null;
  return event.damageTrailers
    .map((trailer) => {
      const label = trailer.labels
        .map((value) => value.replace(/^Partial /, "").replace(/^Full /, ""))
        .join("+")
        .toLowerCase();
      return `${trailer.amount.toLocaleString()} ${label}`;
    })
    .join(" · ");
}

export function eventDetail(event: RawDebugEvent): string {
  return [event.extra, damageTrailerSummary(event)].filter(Boolean).join(" · ") || "—";
}

export function eventValue(event: RawDebugEvent): string {
  if (event.streamType === "aura_cast") return "-";
  const hasPrimaryValue = !["cast", "spell_start", "spell_fail", "ressurection", "dispel", "interrupt", "unit_classification"].includes(event.streamType);
  return hasPrimaryValue ? event.amount.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "—";
}
