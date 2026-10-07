import { isInstallationV1, type CustomPanelInstallationV1 } from "./pluginTypes";

export const CUSTOM_PANELS_ENABLED_KEY = "chronicle-custom-panels-enabled-v1";
export const CUSTOM_PANEL_INSTALLATIONS_KEY = "chronicle-custom-panel-installations-v1";

export interface CustomPanelStorageSnapshot {
  enabled: boolean;
  installations: CustomPanelInstallationV1[];
  corruptRecords: number;
}

const EMPTY_SNAPSHOT: CustomPanelStorageSnapshot = Object.freeze({ enabled: false, installations: [], corruptRecords: 0 });

export function readCustomPanelStorage(storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): CustomPanelStorageSnapshot {
  if (!storage) return EMPTY_SNAPSHOT;
  let enabled = false;
  try { enabled = storage.getItem(CUSTOM_PANELS_ENABLED_KEY) === "true"; } catch { return EMPTY_SNAPSHOT; }
  const raw = storage.getItem(CUSTOM_PANEL_INSTALLATIONS_KEY);
  if (!raw) return { enabled, installations: [], corruptRecords: 0 };
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return { enabled, installations: [], corruptRecords: 1 };
    const installations = values.filter(isInstallationV1);
    return { enabled, installations, corruptRecords: values.length - installations.length };
  } catch {
    return { enabled, installations: [], corruptRecords: 1 };
  }
}

export function clearCustomPanelStorage(storage: Storage = window.localStorage): void {
  storage.removeItem(CUSTOM_PANELS_ENABLED_KEY);
  storage.removeItem(CUSTOM_PANEL_INSTALLATIONS_KEY);
}
