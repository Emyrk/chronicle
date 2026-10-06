import { useCustomPanelAccountSettings, type CustomPanelAccountSnapshot } from "./pluginAccountStorage";
import { parseCustomPanelRef, type ChroniclePanelManifestPanelV1, type CustomPanelInstallationV1, type CustomPanelRef, type CustomPanelRegistryState } from "./pluginTypes";

export interface ResolvedCustomPanel {
  state: CustomPanelRegistryState;
  ref: CustomPanelRef;
  repository?: string;
  panelId?: string;
  installation?: CustomPanelInstallationV1;
  panel?: ChroniclePanelManifestPanelV1;
}

const DISABLED_SNAPSHOT: CustomPanelAccountSnapshot = Object.freeze({
  enabled: false,
  installations: [],
  corruptRecords: 0,
  revision: 0,
  loading: false,
  error: null,
});

export function useCustomPanelRegistry(active = true): CustomPanelAccountSnapshot {
  return useCustomPanelAccountSettings(active);
}

export function resolveCustomPanel(ref: CustomPanelRef, snapshot: CustomPanelAccountSnapshot = DISABLED_SNAPSHOT): ResolvedCustomPanel {
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

export function listSelectableCustomPanels(snapshot: CustomPanelAccountSnapshot = DISABLED_SNAPSHOT): Array<{ ref: CustomPanelRef; installation: CustomPanelInstallationV1; panel: ChroniclePanelManifestPanelV1 }> {
  if (!snapshot.enabled) return [];
  return snapshot.installations.flatMap((installation) => installation.enabled ? installation.manifest.panels.map((panel) => ({
    ref: `custom:github:${installation.repository}\0${panel.id}` as CustomPanelRef,
    installation,
    panel,
  })) : []);
}
