/**
 * Curated auras whose applications count as procs on the rotation timeline.
 * Some log formats never write a spell_go for many procs (talent triggers,
 * weapon procs); the aura they apply is the only evidence. Each application,
 * refresh or stack gain of one of these auras becomes a proc on the rail.
 * Worker-safe: the processor imports the names.
 */

import type { LogFormat } from "@/config/serverCapabilities";

export interface AuraProc {
  /** Stable key for React and the rules view. */
  id: string;
  /** Aura names (every rank) this applies to. */
  names: string[];
  /** Where the aura lands: on the player themselves, or on the unit they hit. */
  on: "self" | "enemy";
  /** Log formats that need it (they do not log the proc as a cast). */
  formats: LogFormat[];
  /** Why the entry exists. */
  note: string;
}

/** Formats that leave many procs out of spell_go. */
const NO_PROC_CAST_FORMATS: LogFormat[] = ["2.4.3-cc-addon", "3.3.5a-cc-addon", "v22-cleu"];

export const AURA_PROCS: AuraProc[] = [
  {
    id: "flurry",
    names: ["Flurry"],
    on: "self",
    formats: NO_PROC_CAST_FORMATS,
    note: "Flurry procs on crits; the log only shows the buff being gained or refreshed.",
  },
  {
    id: "deep-wounds",
    names: ["Deep Wounds", "Deep Wound"],
    on: "enemy",
    formats: NO_PROC_CAST_FORMATS,
    note: "Deep Wounds procs on crits; the log only shows the bleed being applied or refreshed.",
  },
];

const normalize = (name: string) => name.trim().toLowerCase();

/** Lowercased aura name → where it lands, for every curated entry. */
export const AURA_PROC_NAMES: ReadonlyMap<string, AuraProc["on"]> = new Map(
  AURA_PROCS.flatMap((p) => p.names.map((n) => [normalize(n), p.on] as const)),
);

/** Entries that apply to a log of this format. */
export function activeAuraProcs(format: string | undefined, procs: readonly AuraProc[] = AURA_PROCS): AuraProc[] {
  return format ? procs.filter((p) => (p.formats as string[]).includes(format)) : [];
}

/** The entry covering an aura name, if any. */
export function findAuraProc(procs: readonly AuraProc[], spellName: string): AuraProc | undefined {
  const name = normalize(spellName);
  return procs.find((p) => p.names.some((n) => normalize(n) === name));
}
