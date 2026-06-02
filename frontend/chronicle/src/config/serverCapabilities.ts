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
  | "3.3.5a-cc-addon"
  | "azerothcore-mod";

/** Selectable parse formats (admin upload/reparse overrides). */
export const LOG_FORMAT_OPTIONS: readonly { value: LogFormat; label: string }[] = [
  { value: "1.12a-superwow-addon", label: "1.12a · SuperWoW" },
  { value: "1.12a-cc-addon", label: "1.12a · ChronicleCompanion" },
  { value: "3.3.5a-cc-addon", label: "3.3.5a · ChronicleCompanion" },
  { value: "azerothcore-mod", label: "AzerothCore Mod" },
];

/**
 * Selectable flavor presets (comma-joined tag sets) matching the server-side
 * ServerFlavor map. Admins pick a whole set; the parser checks tag membership.
 */
export const FLAVOR_PRESET_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "vanilla,nightmare-of-ursol,turtle", label: "Turtle" },
  { value: "vanilla,nightmare-of-ursol,octowow", label: "OctoWoW" },
  { value: "vanilla,kronos", label: "Kronos" },
  { value: "vanilla", label: "Vanilla" },
  { value: "wrath,epoch", label: "Epoch" },
  { value: "wrath,azerothcore", label: "AzerothCore" },
  { value: "wrath", label: "Wrath" },
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
