import {
  BarChart3,
  Clock,
  Crown,
  Film,
  Gauge,
  HeartPulse,
  Hourglass,
  ShieldCheck,
  Skull,
  Swords,
  Timer,
  Trophy,
  User,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { SearchForm as Form } from "./queryModel";

/*
 * The conditions the sentence form can add, with who may add them. To add a
 * condition: give the Form a field (queryModel.ts, with its formToTree /
 * treeToForm mapping), add it here (KINDS, hasValue, cleared), then render
 * its sentence in SentenceForm.
 */

export type Kind =
  | "difficulty"
  | "raidSize"
  | "hasVideo"
  | "killed"
  | "noWipes"
  | "bossKillTime"
  | "bossesKilled"
  | "wipes"
  | "deaths"
  | "killParse"
  | "clearParse"
  | "playerParse"
  | "clearTime"
  | "bossTime"
  | "trashTime"
  | "idleTime"
  | "classCount"
  | "players"
  | "guildCount"
  | "playerStat"
  | "capabilities";

/** Who can add a condition: anyone, logged-in users, or Honored supporters (the costly ones). */
export type Tier = "anon" | "free" | "honored";

export interface KindDef {
  kind: Kind;
  icon: LucideIcon;
  /** What the menu shows, phrased like the sentence. */
  label: string;
  group: string;
  tier: Tier;
  /** One line per entry; can be added more than once. */
  list?: boolean;
}

export const KINDS: KindDef[] = [
  { kind: "killed", icon: Skull, label: "…a boss died", group: "Bosses", tier: "free" },
  { kind: "noWipes", icon: ShieldCheck, label: "…a boss was never wiped on", group: "Bosses", tier: "free" },
  { kind: "bossKillTime", icon: Timer, label: "…a boss died quickly", group: "Bosses", tier: "free", list: true },
  { kind: "bossesKilled", icon: Crown, label: "…enough bosses died", group: "Bosses", tier: "free" },
  { kind: "wipes", icon: Skull, label: "…there were few wipes", group: "Bosses", tier: "free" },
  { kind: "deaths", icon: HeartPulse, label: "…there were few deaths", group: "Bosses", tier: "free" },
  { kind: "killParse", icon: Trophy, label: "…kill time parsed well", group: "Parses", tier: "free" },
  { kind: "clearParse", icon: Gauge, label: "…the clear parsed well", group: "Parses", tier: "free" },
  { kind: "playerParse", icon: Trophy, label: "…a player parsed well", group: "Parses", tier: "honored", list: true },
  { kind: "clearTime", icon: Clock, label: "…the clear was fast", group: "Speed", tier: "free" },
  { kind: "bossTime", icon: Swords, label: "…boss fights were fast", group: "Speed", tier: "honored" },
  { kind: "trashTime", icon: Clock, label: "…trash was fast", group: "Speed", tier: "honored" },
  { kind: "idleTime", icon: Hourglass, label: "…little time was spent idle", group: "Speed", tier: "honored" },
  { kind: "classCount", icon: Users, label: "…the raid had a class or spec", group: "Roster", tier: "free", list: true },
  { kind: "players", icon: User, label: "…a player was in the raid", group: "Roster", tier: "free" },
  { kind: "guildCount", icon: Users, label: "…members of a guild attended", group: "Roster", tier: "free", list: true },
  { kind: "playerStat", icon: BarChart3, label: "…a player hit a DPS, HPS or item level", group: "Roster", tier: "honored", list: true },
  { kind: "raidSize", icon: Users, label: "…it was a 10 / 20 / 40-player raid", group: "Run", tier: "free" },
  { kind: "difficulty", icon: Swords, label: "…the difficulty was", group: "Run", tier: "anon" },
  { kind: "hasVideo", icon: Video, label: "…it has a video", group: "Run", tier: "free" },
  { kind: "capabilities", icon: Film, label: "…the log recorded something", group: "Log", tier: "free" },
];
export const KIND_DEF = new Map(KINDS.map((d) => [d.kind, d]));

/** Whether a condition has a value. */
export function hasValue(f: Form, k: Kind): boolean {
  switch (k) {
    case "difficulty":
      return f.difficulty.trim() !== "";
    case "raidSize":
      return f.maxPlayers != null;
    case "hasVideo":
      return f.hasVideo;
    case "killed":
      return f.killed.length > 0;
    case "noWipes":
      return f.noWipes.length > 0;
    case "bossKillTime":
      return f.bossKillTimes.length > 0;
    case "bossesKilled":
      return f.bossesKilledMin != null;
    case "wipes":
      return f.wipesMax != null;
    case "deaths":
      return f.deathsMax != null;
    case "killParse":
      return f.killParseMin != null || f.killParseBosses.length > 0;
    case "clearParse":
      return f.clearParseMin != null;
    case "playerParse":
      return f.playerParses.length > 0;
    case "clearTime":
      return f.clearTimeMaxMinutes != null;
    case "bossTime":
      return f.bossTimeMaxMinutes != null;
    case "trashTime":
      return f.trashTimeMaxMinutes != null;
    case "idleTime":
      return f.idleTimeMaxMinutes != null;
    case "classCount":
      return f.classCounts.length > 0;
    case "players":
      return f.players.length > 0;
    case "guildCount":
      return f.guildCounts.length > 0;
    case "playerStat":
      return f.playerStats.length > 0;
    case "capabilities":
      return f.capabilities.length > 0;
  }
}

/** Resets a single-line condition. */
export function cleared(k: Kind): Partial<Form> {
  switch (k) {
    case "difficulty":
      return { difficulty: "" };
    case "raidSize":
      return { maxPlayers: null };
    case "hasVideo":
      return { hasVideo: false };
    case "killed":
      return { killed: [] };
    case "noWipes":
      return { noWipes: [] };
    case "bossesKilled":
      return { bossesKilledMin: null };
    case "wipes":
      return { wipesMax: null };
    case "deaths":
      return { deathsMax: null };
    case "killParse":
      return { killParseMin: null, killParseBosses: [], killParseMatch: "any" };
    case "clearParse":
      return { clearParseMin: null };
    case "clearTime":
      return { clearTimeMaxMinutes: null };
    case "bossTime":
      return { bossTimeMaxMinutes: null };
    case "trashTime":
      return { trashTimeMaxMinutes: null };
    case "idleTime":
      return { idleTimeMaxMinutes: null };
    case "players":
      return { players: [] };
    case "capabilities":
      return { capabilities: [] };
    default:
      return {};
  }
}

/** True when the form uses a condition only Honored supporters can search by. */
export function formNeedsHonored(f: Form): boolean {
  return KINDS.some((d) => d.tier === "honored" && hasValue(f, d.kind));
}
