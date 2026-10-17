import { HitTypeCrit } from "@/lib/hittype/hittype";
import type {
  AuraProcessorEvent,
  DamageProcessorEvent,
  HealProcessorEvent,
  InterruptProcessorEvent,
  PanelProcessor,
  ResurrectionProcessorEvent,
  SlainProcessorEvent,
  SpellGoProcessorEvent,
} from "../processorTypes";
import { AuraTransition } from "../processorTypes";

export type ActivityKind = "damage" | "heal" | "cast" | "aura_gain" | "aura_fade" | "death" | "interrupt" | "resurrect";

/** One line of the activity log. */
export interface ActivityEntry {
  timestampMs: number;
  kind: ActivityKind;
  source: string;
  target: string;
  spellId: number | null;
  spellName: string;
  /** Damage dealt, or health a heal restored (overheal excluded). */
  amount: number;
  overheal: number;
  crit: boolean;
  /** First spell school bit (chronicleproto School), 0 when unknown. */
  school: number;
  isBuff: boolean;
}

export interface ActivityLogEncounter {
  encounterId: string;
  startMs: number;
  endMs: number;
  /** In time order. */
  entries: ActivityEntry[];
}

export interface ActivityLogResult {
  encounters: Map<string, ActivityLogEncounter>;
}

export type ActivityLogProcessorEvent =
  | DamageProcessorEvent
  | HealProcessorEvent
  | SpellGoProcessorEvent
  | AuraProcessorEvent
  | SlainProcessorEvent
  | InterruptProcessorEvent
  | ResurrectionProcessorEvent;

// Auto attack, Auto Shot and wand Shoot: every swing would drown the log.
const AUTO_ATTACK_SPELL_IDS = new Set([6603, 75, 5019]);

function entry(timestampMs: number, kind: ActivityKind, source: string, target: string): ActivityEntry {
  return { timestampMs, kind, source, target, spellId: null, spellName: "", amount: 0, overheal: 0, crit: false, school: 0, isBuff: false };
}

// Copies the (reused) stream event into a compact entry, or null to skip it.
function toEntry(event: ActivityLogProcessorEvent, timestampMs: number): ActivityEntry | null {
  switch (event.type) {
    case "damage": {
      if (event.amount <= 0) return null;
      const line = entry(timestampMs, "damage", event.caster, event.target);
      line.spellId = event.spellId;
      line.spellName = event.sourceName;
      line.amount = event.amount;
      line.crit = (event.hitType & HitTypeCrit) !== 0;
      line.school = event.schools[0] ?? 0;
      return line;
    }
    case "heal": {
      const effective = Math.max(0, event.amount - event.overheal);
      if (event.amount <= 0) return null;
      const line = entry(timestampMs, "heal", event.caster, event.target);
      line.spellId = event.spellId;
      line.spellName = event.sourceName;
      line.amount = effective;
      line.overheal = event.overheal;
      line.crit = (event.hitType & HitTypeCrit) !== 0;
      line.school = event.schools[0] ?? 0;
      return line;
    }
    case "spell_go": {
      if (AUTO_ATTACK_SPELL_IDS.has(event.spell.id)) return null;
      const line = entry(timestampMs, "cast", event.caster, event.target);
      line.spellId = event.spell.id;
      line.spellName = event.spell.name;
      return line;
    }
    case "aura": {
      const gained = event.transition === AuraTransition.Applied;
      const faded = event.transition === AuraTransition.Removed;
      if (!gained && !faded) return null;
      const line = entry(timestampMs, gained ? "aura_gain" : "aura_fade", event.caster ?? "", event.target);
      line.spellId = event.spellId;
      line.spellName = event.spellName;
      line.isBuff = event.isBuff;
      return line;
    }
    case "slain":
      return entry(timestampMs, "death", event.caster, event.target);
    case "interrupt": {
      const line = entry(timestampMs, "interrupt", event.caster, event.target);
      line.spellId = event.extraSpellId || null;
      line.spellName = event.spellName ?? "";
      line.school = event.extraSchools[0] ?? 0;
      return line;
    }
    case "ressurection": {
      const line = entry(timestampMs, "resurrect", event.source, event.target);
      line.spellId = event.spell.id;
      line.spellName = event.spell.name;
      return line;
    }
    default:
      return null;
  }
}

export const activityLogProcessor: PanelProcessor<ActivityLogResult, ActivityLogProcessorEvent> = {
  id: "activity_log",
  streams: ["damage", "heal", "spell_go", "aura", "slain", "interrupt", "ressurection"],
  createState: () => ({ encounters: new Map() }),
  processEvent(state, event, encounterId, firstTimestamp, _streamType, context) {
    if (!context.selectedEncounterIds.has(encounterId)) return;
    const timestampMs = firstTimestamp.getTime() + event.offsetMilli;
    let encounter = state.encounters.get(encounterId);
    if (!encounter) {
      encounter = { encounterId, startMs: firstTimestamp.getTime(), endMs: timestampMs, entries: [] };
      state.encounters.set(encounterId, encounter);
    }
    encounter.endMs = Math.max(encounter.endMs, timestampMs);
    const line = toEntry(event, timestampMs);
    if (line) encounter.entries.push(line);
  },
};

export type ActivityFilter = "highlights" | "all" | "damage" | "healing" | "auras" | "casts";

/**
 * Whether an entry belongs under a tab. Highlights are what a viewer wants to
 * notice: crits, deaths, resurrects, interrupts and enemy casts (`isFriendly`:
 * players and their pets are not enemies).
 */
export function activityMatches(line: ActivityEntry, filter: ActivityFilter, isFriendly: (guid: string) => boolean): boolean {
  switch (filter) {
    case "all": return true;
    case "damage": return line.kind === "damage";
    case "healing": return line.kind === "heal";
    case "auras": return line.kind === "aura_gain" || line.kind === "aura_fade";
    case "casts": return line.kind === "cast";
    case "highlights":
      return line.crit || line.kind === "death" || line.kind === "resurrect" || line.kind === "interrupt"
        || (line.kind === "cast" && line.source !== "" && !isFriendly(line.source));
  }
}

/** The newest `limit` matching entries at or before `cursorMs`, newest first. */
export function recentActivity(
  entries: readonly ActivityEntry[],
  cursorMs: number,
  limit: number,
  matches: (line: ActivityEntry) => boolean,
): ActivityEntry[] {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (entries[middle].timestampMs <= cursorMs) low = middle + 1;
    else high = middle;
  }
  const out: ActivityEntry[] = [];
  for (let index = low - 1; index >= 0 && out.length < limit; index -= 1) {
    if (matches(entries[index])) out.push(entries[index]);
  }
  return out;
}
