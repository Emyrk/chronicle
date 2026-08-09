export const SERVER_NAME = import.meta.env.VITE_SERVER_NAME ?? "turtle";

/** Log type identifiers that match the backend LogType enum. */
export type DefaultLogType =
  | "v1"
  | "v2"
  | "azerothcore-clientside"
  | "epoch"
  | "kronos";

/** Log format identifiers that match the backend log_format enum. */
export type LogFormat =
  | "1.12a-superwow-addon"
  | "1.12a-cc-addon"
  | "2.4.3-cc-addon"
  | "3.3.5a-cc-addon"
  | "azerothcore-mod";

/** Selectable parse formats (admin upload/reparse overrides). */
export const LOG_FORMAT_OPTIONS: readonly { value: LogFormat; label: string }[] = [
  { value: "1.12a-superwow-addon", label: "1.12a · SuperWoW" },
  { value: "1.12a-cc-addon", label: "1.12a · ChronicleCompanion" },
  { value: "2.4.3-cc-addon", label: "2.4.3 · ChronicleCompanion" },
  { value: "3.3.5a-cc-addon", label: "3.3.5a · ChronicleCompanion" },
  { value: "azerothcore-mod", label: "AzerothCore Mod" },
];


/** Features that may differ per server. */
export interface ServerCapabilities {
  armory: boolean;
  /** Which faction Blood Elf belongs to on this server. */
  bloodElfFaction: "Horde" | "Alliance";
  /** The log type used by default for this server (matches backend LogType). */
  defaultLogType: DefaultLogType;
  /** Parse format the frontend stamps on uploads for this server. */
  defaultFormat: LogFormat;
  /** Server-mechanics flavor tags the frontend stamps on uploads. */
  defaultFlavor: readonly string[];
  /** Talent calculator configuration. */
  talentCalculator?: {
    maxTalentPoints: number;
    maxLevel: number;
    classIds: number[];
  };
}

const CAPABILITIES: Record<string, ServerCapabilities> = {
  turtle: {
    armory: true,
    bloodElfFaction: "Alliance",
    defaultLogType: "v2",
    defaultFormat: "1.12a-cc-addon",
    defaultFlavor: ["vanilla", "nightmare-of-ursol", "turtle"],
  },
  octowow: {
    armory: true,
    bloodElfFaction: "Alliance",
    defaultLogType: "v2",
    defaultFormat: "1.12a-cc-addon",
    defaultFlavor: ["vanilla", "nightmare-of-ursol", "octowow"],
  },
  azerothcore: {
    armory: true,
    bloodElfFaction: "Horde",
    defaultLogType: "azerothcore-clientside",
    defaultFormat: "3.3.5a-cc-addon",
    defaultFlavor: ["wrath", "azerothcore"],
    // TODO: talent calculator config (maxLevel, maxTalentPoints, classIds) should
    // come from the tenant/server API instead of being hardcoded per build.
    talentCalculator: {
      maxTalentPoints: 71,
      maxLevel: 80,
      classIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11],
    },
  },
  // The values below must mirror the server-side derivation for each build
  // (LogType.Format() + ServerFlavor) so the frontend override is a no-op for
  // single-server deploys.
  epoch: {
    armory: true,
    bloodElfFaction: "Horde",
    defaultLogType: "epoch",
    defaultFormat: "3.3.5a-cc-addon",
    defaultFlavor: ["wrath", "epoch"],
  },
  kronos: {
    armory: true,
    bloodElfFaction: "Alliance",
    defaultLogType: "kronos",
    defaultFormat: "1.12a-cc-addon",
    defaultFlavor: ["vanilla", "kronos"],
  },
  vanillaplus: {
    armory: true,
    bloodElfFaction: "Alliance",
    defaultLogType: "v2",
    defaultFormat: "1.12a-cc-addon",
    defaultFlavor: ["vanilla", "vanillaplus"],
  },
};

const DEFAULT_CAPABILITIES: ServerCapabilities = {
  armory: true,
  bloodElfFaction: "Horde",
  defaultLogType: "v2",
  defaultFormat: "1.12a-cc-addon",
  defaultFlavor: ["vanilla"],
  talentCalculator: {
    maxTalentPoints: 51,
    maxLevel: 60,
    classIds: [1, 2, 3, 4, 5, 7, 8, 9, 11],
  },
};

/**
 * Whether the current build has an explicit capabilities entry. When false, the
 * frontend must NOT override the server's parse-axis derivation on upload —
 * sending the DEFAULT_CAPABILITIES values could mis-stamp an unconfigured
 * server (e.g. a 3.3.5a server getting the vanilla default). The server's own
 * build-tag derivation is authoritative in that case.
 */
export const hasExplicitServerCapabilities: boolean = SERVER_NAME in CAPABILITIES;

/** Capabilities for the current server. */
export const serverCapabilities: ServerCapabilities =
  CAPABILITIES[SERVER_NAME] ?? DEFAULT_CAPABILITIES;
