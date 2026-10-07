export type ChronicleStreamType = "damage" | "extra_attack" | "heal" | "unit_position" | "unit_resources" | "resource_change" | "slain" | "ressurection" | "cast" | "aura" | "spell_go" | "aura_cast" | "spell_start" | "spell_fail" | "unit_classification" | "combatant_info" | "dispel" | "interrupt" | "absorbed" | "companion_stats" | "consume" | "raid_group";

export const CUSTOM_PANEL_HOST_API_VERSION = 1 as const;
export const CUSTOM_PANEL_OPTION_MAX_LENGTH = 2048;
export const CUSTOM_PANEL_DESCRIPTION_MAX_LENGTH = 300;

export type CustomPanelRef = `custom:${string}`;
export type CustomPanelRegistryState =
  "available" | "disabled" | "missing" | "invalid" | "incompatible";

export interface ParsedCustomPanelRef {
  source: "github";
  repository: string;
  panelId: string;
}

export interface ResolvedArtifact {
  url: string;
  sha256: string;
  size: number;
}

export interface ChroniclePanelManifestPanelV1 {
  id: string;
  name: string;
  description?: string;
  streams: ChronicleStreamType[];
  worker?: boolean;
}

export interface ChroniclePanelManifestArtifactV1 {
  path: string;
  sha256: string;
  size: number;
}

export interface ChroniclePanelManifestV1 {
  schema_version: 1;
  plugin: {
    id: string;
    name: string;
    version: string;
    description?: string;
    homepage?: string;
  };
  host: { api_version: 1 };
  artifacts: {
    entry: ChroniclePanelManifestArtifactV1;
    worker?: ChroniclePanelManifestArtifactV1;
    styles?: ChroniclePanelManifestArtifactV1;
  };
  panels: ChroniclePanelManifestPanelV1[];
}

export interface CustomPanelInstallationV1 {
  repository: string;
  commitSha: string;
  installedRef: string;
  manifest: ChroniclePanelManifestV1;
  manifestSha256: string;
  artifacts: {
    entry: ResolvedArtifact;
    worker?: ResolvedArtifact;
    styles?: ResolvedArtifact;
  };
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
}

export interface ResolveCustomPanelResponse {
  repository: string;
  commit_sha: string;
  manifest: ChroniclePanelManifestV1;
  manifest_sha256: string;
  artifacts: {
    entry: ResolvedArtifact;
    worker?: ResolvedArtifact;
    styles?: ResolvedArtifact;
  };
}

export interface PluginEventStreamV1 {
  type: ChronicleStreamType;
  encoding: "chronicle-event-stream-v1";
  data: ArrayBuffer;
  headers: Array<{
    encounterId: string;
    firstTimestampMs: number;
    count: number;
    dataLength: number;
  }>;
}

export interface PluginEncounterV1 {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface PluginPlayerV1 {
  id?: string;
  name: string;
  class?: string;
  class_name?: string;
}

export interface PluginUnitV1 {
  name: string;
  owner?: string | null;
  entry?: number;
}

export interface ChroniclePanelSnapshotV1 {
  instance: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    capabilities: string[];
    encounters: PluginEncounterV1[];
    players: Record<string, PluginPlayerV1>;
    units: Record<string, PluginUnitV1>;
  };
  selection: {
    encounterIds: string[];
    playerIds: string[];
    enemyIds: string[];
  };
  sync: { enabled: boolean; playing: boolean; timestampMs: number | null };
  panel: {
    panelInstanceId: string;
    option: string | null;
    width: number;
    height: number;
    renderMode: "default" | "layout_lab";
    poppedOut: boolean;
  };
  theme: { mode: "light" | "dark" };
}

export interface PluginItemMetadataV1 {
  entry: number;
  name: string;
  quality: number;
}

export const CUSTOM_PANEL_MAX_BREAKOUTS = 8;
export const CUSTOM_PANEL_BREAKOUT_TITLE_MAX_LENGTH = 100;

export interface ChroniclePanelBreakoutPositionV1 {
  x: number;
  y: number;
}

export interface ChroniclePanelBreakoutSizeV1 {
  width: number;
  height: number;
}

export interface ChroniclePanelBreakoutOptionsV1 {
  title: string;
  initialPosition?: ChroniclePanelBreakoutPositionV1;
  initialSize?: ChroniclePanelBreakoutSizeV1;
  onClose?: () => void;
}

export interface ChroniclePanelBreakoutHandleV1 {
  id: string;
  root: ShadowRoot;
  close(): void;
}

export interface ChroniclePanelHostAPIV1 {
  events: { getStream(type: ChronicleStreamType): Promise<PluginEventStreamV1> };
  gameData: {
    getItemMetadata(itemIds: number[]): Promise<PluginItemMetadataV1[]>;
  };
  workers: { create(): Worker };
  breakouts: {
    open(options: ChroniclePanelBreakoutOptionsV1): ChroniclePanelBreakoutHandleV1;
    closeAll(): void;
  };
  panel: {
    setOption(option: string | null): void;
    selectEncounters(ids: string[]): void;
    togglePlayer(id: string): void;
    togglePlayers(ids: string[]): void;
  };
  lifecycle: { signal: AbortSignal };
}

export interface ChroniclePanelMountRequestV1 {
  panelId: string;
  root: ShadowRoot;
  api: ChroniclePanelHostAPIV1;
  snapshot: ChroniclePanelSnapshotV1;
}

export interface ChroniclePanelInstanceV1 {
  update?(snapshot: ChroniclePanelSnapshotV1): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

export interface ChroniclePanelPluginV1 {
  apiVersion: 1;
  mount(
    request: ChroniclePanelMountRequestV1,
  ): ChroniclePanelInstanceV1 | Promise<ChroniclePanelInstanceV1>;
}

const ID_PATTERN = /^[a-z0-9._-]+$/;
const REPOSITORY_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/;
const KNOWN_STREAMS = new Set<ChronicleStreamType>([
  "damage",
  "extra_attack",
  "heal",
  "unit_position",
  "unit_resources",
  "resource_change",
  "slain",
  "ressurection",
  "cast",
  "aura",
  "spell_go",
  "aura_cast",
  "spell_start",
  "spell_fail",
  "unit_classification",
  "combatant_info",
  "dispel",
  "interrupt",
  "absorbed",
  "companion_stats",
  "consume",
  "raid_group",
]);

export function normalizeRepository(value: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\.git$/i, "");
  let candidate = trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() !== "github.com") return null;
    candidate = url.pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    // owner/repo form
  }
  candidate = candidate.toLowerCase();
  return REPOSITORY_PATTERN.test(candidate) ? candidate : null;
}

export function isCustomPanelRef(value: string): value is CustomPanelRef {
  return value.startsWith("custom:");
}

export function createCustomPanelRef(
  repository: string,
  panelId: string,
): CustomPanelRef {
  const normalized = normalizeRepository(repository);
  if (!normalized || !ID_PATTERN.test(panelId))
    throw new Error("Invalid custom panel reference");
  return `custom:github:${normalized}:${panelId}`;
}

export function parseCustomPanelRef(
  value: string,
): ParsedCustomPanelRef | null {
  if (!isCustomPanelRef(value)) return null;
  const payload = value.slice("custom:".length);
  if (!payload.startsWith("github:")) return null;
  const githubPayload = payload.slice("github:".length);
  const separator = githubPayload.includes("\0")
    ? githubPayload.indexOf("\0")
    : githubPayload.indexOf(":");
  if (separator < 0) return null;
  const repository = normalizeRepository(githubPayload.slice(0, separator));
  const panelId = githubPayload.slice(separator + 1);
  if (!repository || !ID_PATTERN.test(panelId)) return null;
  return { source: "github", repository, panelId };
}

export function canonicalizeCustomPanelRef(
  value: string,
): CustomPanelRef | null {
  const parsed = parseCustomPanelRef(value);
  return parsed
    ? createCustomPanelRef(parsed.repository, parsed.panelId)
    : null;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ARTIFACT_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function isManifestArtifact(
  value: unknown,
  maxSize: number,
): value is ChroniclePanelManifestArtifactV1 {
  if (!value || typeof value !== "object") return false;
  const item = value as ChroniclePanelManifestArtifactV1;
  return (
    typeof item.path === "string" &&
    item.path.length <= 255 &&
    ARTIFACT_PATH_PATTERN.test(item.path) &&
    !item.path.startsWith("/") &&
    !item.path.includes("\\") &&
    item.path.split("/").every((part) => part !== "." && part !== "..") &&
    SHA256_PATTERN.test(item.sha256) &&
    Number.isSafeInteger(item.size) &&
    item.size >= 0 &&
    item.size <= maxSize
  );
}

function isArtifact(value: unknown): value is ResolvedArtifact {
  if (!value || typeof value !== "object") return false;
  const item = value as ResolvedArtifact;
  return (
    typeof item.url === "string" &&
    item.url.startsWith("https://raw.githubusercontent.com/") &&
    SHA256_PATTERN.test(item.sha256) &&
    Number.isSafeInteger(item.size) &&
    item.size >= 0
  );
}

export function isManifestV1(
  value: unknown,
  repository?: string,
): value is ChroniclePanelManifestV1 {
  if (!value || typeof value !== "object") return false;
  const manifest = value as ChroniclePanelManifestV1;
  if (manifest.schema_version !== 1 || manifest.host?.api_version !== 1)
    return false;
  if (
    !manifest.plugin ||
    typeof manifest.plugin.name !== "string" ||
    typeof manifest.plugin.version !== "string"
  )
    return false;
  if (repository && manifest.plugin.id !== `github:${repository}`) return false;
  if (
    !manifest.artifacts ||
    !isManifestArtifact(manifest.artifacts.entry, 2 * 1024 * 1024) ||
    (manifest.artifacts.worker !== undefined &&
      !isManifestArtifact(manifest.artifacts.worker, 4 * 1024 * 1024)) ||
    (manifest.artifacts.styles !== undefined &&
      !isManifestArtifact(manifest.artifacts.styles, 512 * 1024))
  )
    return false;
  if (!Array.isArray(manifest.panels) || manifest.panels.length > 16)
    return false;
  const ids = new Set<string>();
  return manifest.panels.every((panel) => {
    if (
      !panel ||
      !ID_PATTERN.test(panel.id) ||
      ids.has(panel.id) ||
      typeof panel.name !== "string" ||
      !Array.isArray(panel.streams)
    )
      return false;
    if (
      panel.description !== undefined &&
      (typeof panel.description !== "string" ||
        new TextEncoder().encode(panel.description).byteLength >
          CUSTOM_PANEL_DESCRIPTION_MAX_LENGTH)
    )
      return false;
    ids.add(panel.id);
    return panel.streams.every((stream) => KNOWN_STREAMS.has(stream));
  });
}

export function isInstallationV1(
  value: unknown,
): value is CustomPanelInstallationV1 {
  if (!value || typeof value !== "object") return false;
  const item = value as CustomPanelInstallationV1;
  const repository = normalizeRepository(item.repository);
  return (
    repository === item.repository &&
    /^[0-9a-f]{40}$/.test(item.commitSha) &&
    typeof item.installedRef === "string" &&
    isManifestV1(item.manifest, repository) &&
    SHA256_PATTERN.test(item.manifestSha256) &&
    isArtifact(item.artifacts?.entry) &&
    (!item.artifacts.worker || isArtifact(item.artifacts.worker)) &&
    (!item.artifacts.styles || isArtifact(item.artifacts.styles)) &&
    typeof item.enabled === "boolean" &&
    typeof item.installedAt === "string" &&
    typeof item.updatedAt === "string"
  );
}
