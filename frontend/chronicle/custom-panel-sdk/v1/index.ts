/** Stable build-time contract for Chronicle trusted custom panel plugins. */
export type ChronicleStreamType = "damage" | "extra_attack" | "heal" | "resource_change" | "slain" | "ressurection" | "cast" | "aura" | "spell_go" | "aura_cast" | "spell_start" | "spell_fail" | "unit_classification" | "combatant_info" | "dispel" | "interrupt" | "absorbed" | "companion_stats" | "consume" | "raid_group";

export interface PluginEventStreamV1 {
  type: ChronicleStreamType;
  encoding: "chronicle-event-stream-v1";
  data: ArrayBuffer;
  headers: Array<{ encounterId: string; firstTimestampMs: number; count: number; dataLength: number }>;
}

export interface ChroniclePanelSnapshotV1 {
  instance: { id: string; title: string; startTime: string; endTime: string; capabilities: string[]; encounters: unknown[]; players: Record<string, unknown>; units: Record<string, unknown> };
  selection: { encounterIds: string[]; playerIds: string[]; enemyIds: string[] };
  sync: { enabled: boolean; playing: boolean; timestampMs: number | null };
  panel: { panelInstanceId: string; option: string | null; width: number; height: number; renderMode: "default" | "layout_lab"; poppedOut: boolean };
  theme: { mode: "light" | "dark" };
}

export interface ChroniclePanelHostAPIV1 {
  events: { getStream(type: ChronicleStreamType): Promise<PluginEventStreamV1> };
  workers: { create(): Worker };
  panel: { setOption(option: string | null): void; selectEncounters(ids: string[]): void; togglePlayer(id: string): void; togglePlayers(ids: string[]): void };
  lifecycle: { signal: AbortSignal };
}

export interface ChroniclePanelInstanceV1 { update?(snapshot: ChroniclePanelSnapshotV1): void | Promise<void>; destroy?(): void | Promise<void> }
export interface ChroniclePanelPluginV1 { apiVersion: 1; mount(request: { panelId: string; root: ShadowRoot; api: ChroniclePanelHostAPIV1; snapshot: ChroniclePanelSnapshotV1 }): ChroniclePanelInstanceV1 | Promise<ChroniclePanelInstanceV1> }

export interface ChroniclePanelManifestV1 {
  schema_version: 1;
  plugin: { id: string; name: string; version: string; description?: string; homepage?: string };
  host: { api_version: 1 };
  artifacts: { entry: string; worker?: string; styles?: string };
  panels: Array<{ id: string; name: string; description?: string; streams: ChronicleStreamType[]; worker?: boolean }>;
}
