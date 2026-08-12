/**
 * raid-helper.xyz event import.
 *
 * The public API (https://raid-helper.xyz/documentation/api) serves events at
 * /api/v4/events/{id} with permissive CORS, so the browser fetches directly.
 * Users paste links like https://raid-helper.xyz/event/1536776992840613939.
 */
import type { PlayerEntry } from "./types";

export interface RaidHelperSignUp {
  id: number;
  name: string;
  className: string;
  specName?: string | null;
  roleName?: string | null;
  status?: string;
  position?: number;
}

export interface RaidHelperEvent {
  id: string;
  title?: string;
  date?: string;
  signUps?: RaidHelperSignUp[];
}

/** Pull the numeric event id out of a pasted link (or a bare id). */
export function parseEventId(input: string): string | null {
  const match = input.trim().match(/(\d{10,})/);
  return match ? match[1] : null;
}

export async function fetchRaidHelperEvent(eventId: string): Promise<RaidHelperEvent> {
  const response = await fetch(`https://raid-helper.xyz/api/v4/events/${eventId}`);
  if (!response.ok) {
    throw new Error(`raid-helper returned ${response.status} — check the event link`);
  }
  const event = (await response.json()) as RaidHelperEvent;
  if (!Array.isArray(event.signUps)) {
    throw new Error("No sign-ups found on this event");
  }
  return event;
}

/** Sign-up pseudo-classes that carry status rather than a real class. */
const BENCH_CLASSES = new Set(["Bench", "Late", "Tentative"]);
const SKIP_CLASSES = new Set(["Absence"]);

/**
 * raid-helper deduplicates spec names across classes with a numeric suffix
 * ("Protection" = Warrior, "Protection1" = Paladin). Map spec → class for
 * templates whose className is a role bucket ("Tank") instead of a class.
 */
const SPEC_TO_CLASS: Record<string, string> = {
  Arms: "WARRIOR",
  Fury: "WARRIOR",
  Protection: "WARRIOR",
  Protection1: "PALADIN",
  Holy: "PALADIN",
  Holy1: "PRIEST",
  Retribution: "PALADIN",
  Discipline: "PRIEST",
  Shadow: "PRIEST",
  Assassination: "ROGUE",
  Combat: "ROGUE",
  Subtlety: "ROGUE",
  Arcane: "MAGE",
  Fire: "MAGE",
  Frost: "MAGE",
  Affliction: "WARLOCK",
  Demonology: "WARLOCK",
  Destruction: "WARLOCK",
  Beastmastery: "HUNTER",
  Marksmanship: "HUNTER",
  Survival: "HUNTER",
  Balance: "DRUID",
  Feral: "DRUID",
  Guardian: "DRUID",
  Bear: "DRUID",
  Restoration: "DRUID",
  Restoration1: "SHAMAN",
  Elemental: "SHAMAN",
  Enhancement: "SHAMAN",
};

const CLASS_NAME_TO_ENUM: Record<string, string> = {
  Warrior: "WARRIOR",
  Paladin: "PALADIN",
  Hunter: "HUNTER",
  Rogue: "ROGUE",
  Priest: "PRIEST",
  Shaman: "SHAMAN",
  Mage: "MAGE",
  Warlock: "WARLOCK",
  Druid: "DRUID",
};

const ROLE_TO_PLANNER: Record<string, string> = {
  Tanks: "tank",
  Healers: "heal",
  Melee: "dps",
  Ranged: "dps",
  Dps: "dps",
};

/** "Protection1" → "Protection", "Beastmastery" → "Beast Mastery". */
function displaySpec(specName: string | null | undefined): string {
  if (!specName) return "";
  const base = specName.replace(/\d+$/, "");
  return base === "Beastmastery" ? "Beast Mastery" : base;
}

function signUpClass(signUp: RaidHelperSignUp): string {
  return (
    CLASS_NAME_TO_ENUM[signUp.className] ??
    (signUp.specName ? (SPEC_TO_CLASS[signUp.specName] ?? "UNKNOWN") : "UNKNOWN")
  );
}

export interface ParsedSignUp {
  entry: PlayerEntry;
  /** Where this sign-up should land. */
  disposition: "board" | "bench";
  /** True when the entry was matched to a guild roster character. */
  matchedRoster: boolean;
  signUp: RaidHelperSignUp;
}

/**
 * Convert an event's sign-ups to planner entries. Discord names are matched
 * against the guild roster (case-insensitive, each "/"-separated segment) so
 * known characters import as real roster players; everyone else becomes a
 * synthetic player entry.
 */
export function parseSignUps(event: RaidHelperEvent, roster: PlayerEntry[]): ParsedSignUp[] {
  const byName = new Map<string, PlayerEntry>();
  for (const member of roster) byName.set(member.name.toLowerCase(), member);

  const parsed: ParsedSignUp[] = [];
  const signUps = [...(event.signUps ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  for (const signUp of signUps) {
    if (SKIP_CLASSES.has(signUp.className)) continue;
    const benched =
      BENCH_CLASSES.has(signUp.className) || (signUp.status != null && signUp.status !== "primary");
    const note = BENCH_CLASSES.has(signUp.className) ? signUp.className.toLowerCase() : "";

    const segments = signUp.name.split("/").map((s) => s.trim()).filter(Boolean);
    const matched = segments
      .map((segment) => byName.get(segment.toLowerCase()))
      .find((m) => m !== undefined);

    const spec = displaySpec(signUp.specName);
    if (matched) {
      parsed.push({
        entry: { ...matched, spec: spec || matched.spec, note },
        disposition: benched ? "bench" : "board",
        matchedRoster: true,
        signUp,
      });
      continue;
    }

    const cls = signUpClass(signUp);
    const role = ROLE_TO_PLANNER[signUp.roleName ?? ""] ?? "";
    parsed.push({
      entry: {
        kind: "player",
        id: `raid-helper:${signUp.id}`,
        name: segments[0] ?? signUp.name,
        cls,
        spec,
        reportedSpec: "",
        role,
        specRoles: spec || role ? [{ spec, role }] : [],
        avgParse: -1,
        level: 0,
        realmName: "",
        note,
      },
      disposition: benched ? "bench" : "board",
      matchedRoster: false,
      signUp,
    });
  }
  return parsed;
}
