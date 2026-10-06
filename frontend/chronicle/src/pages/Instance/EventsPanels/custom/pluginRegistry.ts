import { useSyncExternalStore } from "react";
import { CUSTOM_PANEL_STORAGE_EVENT, readCustomPanelStorage, type CustomPanelStorageSnapshot } from "./pluginStorage";
import { parseCustomPanelRef, type ChroniclePanelManifestPanelV1, type CustomPanelInstallationV1, type CustomPanelRef, type CustomPanelRegistryState } from "./pluginTypes";

export interface ResolvedCustomPanel {
  state: CustomPanelRegistryState;
  ref: CustomPanelRef;
  repository?: string;
  panelId?: string;
  installation?: CustomPanelInstallationV1;
  panel?: ChroniclePanelManifestPanelV1;
}

let cachedSerialized = "";
let cachedSnapshot: CustomPanelStorageSnapshot = { enabled: false, installations: [], corruptRecords: 0 };

function getSnapshot(): CustomPanelStorageSnapshot {
  const next = readCustomPanelStorage();
  const serialized = JSON.stringify(next);
  if (serialized !== cachedSerialized) {
    cachedSerialized = serialized;
    cachedSnapshot = next;
  }
  return cachedSnapshot;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener("storage", handler);
  window.addEventListener(CUSTOM_PANEL_STORAGE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(CUSTOM_PANEL_STORAGE_EVENT, handler);
  };
}

const DISABLED_SNAPSHOT: CustomPanelStorageSnapshot = Object.freeze({ enabled: false, installations: [], corruptRecords: 0 });

export function useCustomPanelRegistry(active = true): CustomPanelStorageSnapshot {
  return useSyncExternalStore(active ? subscribe : () => () => undefined, active ? getSnapshot : () => DISABLED_SNAPSHOT, () => DISABLED_SNAPSHOT);
}

export function resolveCustomPanel(ref: CustomPanelRef, snapshot = getSnapshot()): ResolvedCustomPanel {
  const parsed = parseCustomPanelRef(ref);
  if (!parsed) return { state: "invalid", ref };
  const base = { ref, repository: parsed.repository, panelId: parsed.panelId };
  const installation = snapshot.installations.find((item) => item.repository === parsed.repository);
  if (!installation) return { state: "missing", ...base };
  if (installation.manifest.host.api_version !== 1) return { state: "incompatible", ...base, installation };
  const panel = installation.manifest.panels.find((item) => item.id === parsed.panelId);
  if (!panel) return { state: "missing", ...base, installation };
  if (!snapshot.enabled || !installation.enabled) return { state: "disabled", ...base, installation, panel };
  return { state: "available", ...base, installation, panel };
}

export function listSelectableCustomPanels(snapshot = getSnapshot()): Array<{ ref: CustomPanelRef; installation: CustomPanelInstallationV1; panel: ChroniclePanelManifestPanelV1 }> {
  if (!snapshot.enabled) return [];
  return snapshot.installations.flatMap((installation) => installation.enabled ? installation.manifest.panels.map((panel) => ({
    ref: `custom:github:${installation.repository}\0${panel.id}` as CustomPanelRef,
    installation,
    panel,
  })) : []);
}
