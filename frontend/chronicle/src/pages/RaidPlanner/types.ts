import type { GuildRosterCharacter } from "@/api/typesGenerated";
import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";

export const GROUP_SIZE = 5;
export const MAX_GROUPS = 8;

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
  | { kind: "slot"; from: SlotLocation };

export const emptyBoard = (groups: number): Board =>
  Array.from({ length: groups }, () => Array<SlotEntry | null>(GROUP_SIZE).fill(null));

export function playerEntry(member: GuildRosterCharacter): PlayerEntry {
  return {
    kind: "player",
    id: member.id,
    name: member.name,
    cls: member.class,
    spec: member.spec ?? "",
    reportedSpec: member.spec ?? "",
    role: member.role ?? "",
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

export const SIZE_PRESETS = [
  { groups: 1, label: "5 · dungeon" },
  { groups: 2, label: "10 · UBRS" },
  { groups: 4, label: "20 · ZG / AQ20" },
  { groups: 8, label: "40 · MC / BWL / AQ40" },
] as const;
