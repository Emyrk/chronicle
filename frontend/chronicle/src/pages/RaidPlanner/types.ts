import type { GuildRosterCharacter } from "@/api/typesGenerated";
import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";

export const GROUP_SIZE = 5;
export const MAX_GROUPS = 8;

/** One spec+role combination observed in the character's recent parses. */
export interface SpecRole {
  spec: string;
  role: string;
}

/** A real character placed on the board, sourced from a guild roster. */
export interface PlayerEntry {
  kind: "player";
  id: string;
  name: string;
  cls: string;
  /** Planned spec; "" means unset / any. */
  spec: string;
  /** Spec reported from logs; "" when unknown. */
  reportedSpec: string;
  role: string;
  /** Distinct spec+role combos over recent parsed instances, most recent first. */
  specRoles: SpecRole[];
  /** Average parse score; -1 when the character has no parses. */
  avgParse: number;
  level: number;
  realmName: string;
  note: string;
}

/** An unfilled slot reserved for a class/build you plan to recruit. */
export interface PlaceholderEntry {
  kind: "placeholder";
  cls: string;
  /** Planned spec; "" means any. */
  spec: string;
  note: string;
}

export type SlotEntry = PlayerEntry | PlaceholderEntry;

/** groups × GROUP_SIZE grid; null = empty slot. */
export type Board = (SlotEntry | null)[][];

export type SlotLocation =
  | { area: "board"; gi: number; si: number }
  | { area: "bench"; index: number };

export type DragPayload =
  | { kind: "class"; cls: string }
  | { kind: "roster"; entry: PlayerEntry }
  | { kind: "roster-multi"; entries: PlayerEntry[] }
  | { kind: "slot"; from: SlotLocation };

/** What the pointer is currently over, for mouseover keybinds (B/Del/E/1–8). */
export type HoverTarget = SlotLocation | { area: "roster"; entry: PlayerEntry };

export const emptyBoard = (groups: number): Board =>
  Array.from({ length: groups }, () => Array<SlotEntry | null>(GROUP_SIZE).fill(null));

export function playerEntry(member: GuildRosterCharacter): PlayerEntry {
  const specRoles = (member.spec_roles ?? []).filter((sr) => sr.spec || sr.role);
  if (specRoles.length === 0 && (member.spec || member.role)) {
    specRoles.push({ spec: member.spec ?? "", role: member.role ?? "" });
  }
  return {
    kind: "player",
    id: member.id,
    name: member.name,
    cls: member.class,
    spec: member.spec ?? "",
    reportedSpec: member.spec ?? "",
    role: member.role ?? "",
    specRoles,
    avgParse: member.avg_parse,
    level: member.level,
    realmName: member.realm_name,
    note: "",
  };
}

/** "Fury Warrior" / "Warrior" for placeholders, character name for players. */
export function entryName(entry: SlotEntry): string {
  if (entry.kind === "player") return entry.name;
  const clsName = CLASS_DISPLAY[entry.cls] ?? entry.cls;
  return entry.spec ? `${entry.spec} ${clsName}` : clsName;
}
