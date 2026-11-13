import type { InstanceSearchOp } from "@/api/typesGenerated";

const FIELD_LABELS: Record<string, string> = {
  "instance.validity": "Validity",
  "instance.name": "Zone",
  "instance.started_at": "Date",
  "instance.max_players": "Raid size",
  "instance.has_video": "Has video",
  "instance.player_count": "Player count",
  "instance.bosses_killed": "Bosses killed",
  "instance.clear_time_ms": "Clear time",
  "instance.clear_qualified": "Clear qualified",
  "instance.boss_time_ms": "Boss time",
  "instance.trash_time_ms": "Trash time",
  "instance.idle_time_ms": "Idle time",
  "instance.clear_parse": "Clear-time parse",
  "instance.kill_time_parse": "Kill-time parse",
  "instance.kill_time_ms": "Kill time",
  "instance.capability": "Log capability",
  "encounter.kill_time_parse": "Kill-time parse",
  "encounter.duration_ms": "Duration",
  "encounter.killed": "Killed",
  "player.guid": "GUID",
  "player.sub_spec": "Sub-spec",
  "player.avg_ilvl": "Avg item level",
  "player.dps": "DPS",
  "player.hps": "HPS",
  "player.parse": "Parse",
};

/** Human label for a field, e.g. "instance.clear_parse" -> "Clear-time parse". */
export function fieldLabel(name: string): string {
  if (FIELD_LABELS[name]) return FIELD_LABELS[name];
  const base = name.slice(name.indexOf(".") + 1).replace(/_ms$/, "").replace(/_/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Field picker groups, in display order. Unlisted fields go under "Other". */
const FIELD_GROUPS: [string, string[]][] = [
  ["Run", ["instance.validity", "instance.name", "instance.realm", "instance.realm_id", "instance.guild", "instance.guild_id", "instance.started_at", "instance.difficulty", "instance.max_players", "instance.category", "instance.recorder", "instance.has_video", "instance.player_count"]],
  ["Bosses & speed", ["instance.bosses_killed", "instance.wipes", "instance.deaths", "instance.clear_time_ms", "instance.clear_qualified", "instance.boss_time_ms", "instance.trash_time_ms", "instance.idle_time_ms", "instance.kill_time_ms"]],
  ["Parses", ["instance.clear_parse", "instance.kill_time_parse"]],
  ["Log", ["instance.capability"]],
  ["Character", ["player.name", "player.guid", "player.class", "player.race", "player.level", "player.guild", "player.guild_id"]],
  ["In fights", ["player.spec", "player.role", "player.dps", "player.hps", "player.deaths", "player.avg_ilvl"]],
  ["Parses", ["player.parse"]],
  ["Pull", ["encounter.name", "encounter.boss", "encounter.outcome", "encounter.killed", "encounter.duration_ms", "encounter.kill_time_parse"]],
];
const GROUP_OF = new Map(FIELD_GROUPS.flatMap(([g, names], i) => names.map((n) => [n, [g, i] as const])));

/** The picker group for a field and its sort rank. */
export function fieldGroup(name: string): { group: string; rank: number } {
  const hit = GROUP_OF.get(name);
  return hit ? { group: hit[0], rank: hit[1] } : { group: "Other", rank: FIELD_GROUPS.length };
}

export const OP_LABELS: Record<InstanceSearchOp, string> = {
  "=": "is",
  "!=": "is not",
  "<": "<",
  "<=": "≤",
  ">": ">",
  ">=": "≥",
  in: "is any of",
  not_in: "is none of",
  contains: "contains",
  starts_with: "starts with",
  between: "between",
};

const CLASS_LABELS: Record<string, string> = {
  DEATH_KNIGHT: "Death Knight",
  DEMON_HUNTER: "Demon Hunter",
};

/** Label for an enum value, e.g. PRIEST -> Priest, unit-position -> Unit position. */
export function enumLabel(value: string): string {
  if (CLASS_LABELS[value]) return CLASS_LABELS[value];
  if (/^[A-Z_]+$/.test(value)) return value.charAt(0) + value.slice(1).toLowerCase();
  if (value === "NightElf") return "Night Elf";
  if (value === "BloodElf") return "Blood Elf";
  const s = value.replace(/[-_]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const PARSE_SCOPE_OPTIONS = [
  { value: "server" as const, label: "Server" },
  { value: "realm" as const, label: "Realm" },
  { value: "guild" as const, label: "Guild" },
];

export const MATCH_OPTIONS = [
  { value: "any" as const, label: "any" },
  { value: "each" as const, label: "each" },
];

export const ON_OPTIONS = [
  { value: "bosses" as const, label: "Bosses" },
  { value: "trash" as const, label: "Trash" },
  { value: "any" as const, label: "Any fight" },
];

export const METRIC_OPTIONS = [
  { value: "dps" as const, label: "DPS" },
  { value: "hps" as const, label: "HPS" },
];

/** Common spec names, used as suggestions (spec is free text). */
export const SPEC_SUGGESTIONS = [
  "Arms", "Fury", "Protection", "Holy", "Retribution", "Beast Mastery", "Marksmanship", "Survival",
  "Assassination", "Combat", "Subtlety", "Discipline", "Shadow", "Elemental", "Enhancement",
  "Restoration", "Arcane", "Fire", "Frost", "Affliction", "Demonology", "Destruction", "Balance", "Feral",
];
