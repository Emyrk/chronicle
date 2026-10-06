import type { StreamType } from "@/hooks/instanceEvents";

export const CUSTOM_PANEL_HOST_API_VERSION = 1 as const;
export const CUSTOM_PANEL_OPTION_MAX_LENGTH = 2048;
export const CUSTOM_PANEL_DESCRIPTION_MAX_LENGTH = 300;

export type CustomPanelRef = `custom:${string}`;
export type CustomPanelRegistryState = "available" | "disabled" | "missing" | "invalid" | "incompatible";

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
  streams: StreamType[];
  worker?: boolean;
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
  artifacts: { entry: string; worker?: string; styles?: string };
  panels: ChroniclePanelManifestPanelV1[];
}

export interface CustomPanelInstallationV1 {
  repository: string;
  commitSha: string;
  installedRef: string;
  manifest: ChroniclePanelManifestV1;
  manifestSha256: string;
  artifacts: { entry: ResolvedArtifact; worker?: ResolvedArtifact; styles?: ResolvedArtifact };
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
}

export interface ResolveCustomPanelResponse {
  repository: string;
  commit_sha: string;
  manifest: ChroniclePanelManifestV1;
  manifest_sha256: string;
  artifacts: { entry: ResolvedArtifact; worker?: ResolvedArtifact; styles?: ResolvedArtifact };
}

export interface PluginEventStreamV1 {
  type: StreamType;
  encoding: "chronicle-event-stream-v1";
  data: ArrayBuffer;
  headers: Array<{ encounterId: string; firstTimestampMs: number; count: number; dataLength: number }>;
}

export interface ChroniclePanelSnapshotV1 {
  instance: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    capabilities: string[];
    encounters: unknown[];
    players: Record<string, unknown>;
    units: Record<string, unknown>;
  };
  selection: { encounterIds: string[]; playerIds: string[]; enemyIds: string[] };
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

export interface ChroniclePanelHostAPIV1 {
  events: { getStream(type: StreamType): Promise<PluginEventStreamV1> };
  gameData: { getItemMetadata(itemIds: number[]): Promise<PluginItemMetadataV1[]> };
  workers: { create(): Worker };
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
  mount(request: ChroniclePanelMountRequestV1): ChroniclePanelInstanceV1 | Promise<ChroniclePanelInstanceV1>;
}

const ID_PATTERN = /^[a-z0-9._-]+$/;
const REPOSITORY_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/;
const KNOWN_STREAMS = new Set<StreamType>([
  "damage", "extra_attack", "heal", "resource_change", "slain", "ressurection", "cast", "aura",
  "spell_go", "aura_cast", "spell_start", "spell_fail", "unit_classification", "combatant_info",
  "dispel", "interrupt", "absorbed", "companion_stats", "consume", "raid_group",
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

export function createCustomPanelRef(repository: string, panelId: string): CustomPanelRef {
  const normalized = normalizeRepository(repository);
  if (!normalized || !ID_PATTERN.test(panelId)) throw new Error("Invalid custom panel reference");
  return `custom:github:${normalized}\0${panelId}`;
}

export function parseCustomPanelRef(value: string): ParsedCustomPanelRef | null {
  if (!isCustomPanelRef(value)) return null;
  const payload = value.slice("custom:".length);
  if (!payload.startsWith("github:")) return null;
  const separator = payload.indexOf("\0");
  if (separator < 0) return null;
  const repository = normalizeRepository(payload.slice("github:".length, separator));
  const panelId = payload.slice(separator + 1);
  if (!repository || !ID_PATTERN.test(panelId)) return null;
  return { source: "github", repository, panelId };
}

function isArtifact(value: unknown): value is ResolvedArtifact {
  if (!value || typeof value !== "object") return false;
  const item = value as ResolvedArtifact;
  return typeof item.url === "string" && item.url.startsWith("/") && typeof item.sha256 === "string" && typeof item.size === "number" && item.size >= 0;
}

export function isManifestV1(value: unknown, repository?: string): value is ChroniclePanelManifestV1 {
  if (!value || typeof value !== "object") return false;
  const manifest = value as ChroniclePanelManifestV1;
  if (manifest.schema_version !== 1 || manifest.host?.api_version !== 1) return false;
  if (!manifest.plugin || typeof manifest.plugin.name !== "string" || typeof manifest.plugin.version !== "string") return false;
  if (repository && manifest.plugin.id !== `github:${repository}`) return false;
  if (!manifest.artifacts || typeof manifest.artifacts.entry !== "string") return false;
  if (!Array.isArray(manifest.panels) || manifest.panels.length > 16) return false;
  const ids = new Set<string>();
  return manifest.panels.every((panel) => {
    if (!panel || !ID_PATTERN.test(panel.id) || ids.has(panel.id) || typeof panel.name !== "string" || !Array.isArray(panel.streams)) return false;
    if (panel.description !== undefined && (typeof panel.description !== "string" || new TextEncoder().encode(panel.description).byteLength > CUSTOM_PANEL_DESCRIPTION_MAX_LENGTH)) return false;
    ids.add(panel.id);
    return panel.streams.every((stream) => KNOWN_STREAMS.has(stream));
  });
}

export function isInstallationV1(value: unknown): value is CustomPanelInstallationV1 {
  if (!value || typeof value !== "object") return false;
  const item = value as CustomPanelInstallationV1;
  const repository = normalizeRepository(item.repository);
  return repository === item.repository && /^[0-9a-f]{40}$/.test(item.commitSha) &&
    typeof item.installedRef === "string" && isManifestV1(item.manifest, repository) &&
    typeof item.manifestSha256 === "string" && isArtifact(item.artifacts?.entry) &&
    (!item.artifacts.worker || isArtifact(item.artifacts.worker)) &&
    (!item.artifacts.styles || isArtifact(item.artifacts.styles)) &&
    typeof item.enabled === "boolean" && typeof item.installedAt === "string" && typeof item.updatedAt === "string";
}
