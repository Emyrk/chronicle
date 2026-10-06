import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomPanelSettings, UpdateCustomPanelSettingsRequest } from "@/api/typesGenerated";
import { clearCustomPanelStorage, CUSTOM_PANEL_INSTALLATIONS_KEY, CUSTOM_PANELS_ENABLED_KEY, readCustomPanelStorage, type CustomPanelStorageSnapshot } from "./pluginStorage";
import { isInstallationV1, type CustomPanelInstallationV1 } from "./pluginTypes";

export const CUSTOM_PANEL_SETTINGS_QUERY_KEY = ["custom-panel-settings"] as const;
const CUSTOM_PANEL_ACCOUNT_EVENT_KEY = "chronicle-custom-panels-account-revision";

export interface CustomPanelAccountSnapshot extends CustomPanelStorageSnapshot {
  revision: number;
  loading: boolean;
  error: Error | null;
}

export interface UpdateCustomPanelAccountSettings {
  enabled: boolean;
  installations: CustomPanelInstallationV1[];
  expectedRevision: number;
}

function normalizeSettings(settings: CustomPanelSettings, corruptRecords = 0): CustomPanelAccountSnapshot {
  const installations = settings.installations.filter(isInstallationV1) as CustomPanelInstallationV1[];
  return {
    enabled: settings.enabled,
    installations,
    corruptRecords: corruptRecords + settings.installations.length - installations.length,
    revision: settings.revision,
    loading: false,
    error: null,
  };
}

async function updateCustomPanelSettings(input: UpdateCustomPanelAccountSettings): Promise<CustomPanelAccountSnapshot> {
  const request: UpdateCustomPanelSettingsRequest = {
    enabled: input.enabled,
    installations: input.installations,
    expected_revision: input.expectedRevision,
  };
  const response = await fetch("/api/v1/me/custom-panels", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(response.status === 409 ? "Custom panel settings changed in another session. Reload and try again." : `Custom panel settings update failed (${response.status}).`);
  return normalizeSettings(await response.json() as CustomPanelSettings);
}

export async function fetchCustomPanelSettings(): Promise<CustomPanelAccountSnapshot> {
  const response = await fetch("/api/v1/me/custom-panels");
  if (!response.ok) throw new Error(`Custom panel settings request failed (${response.status}).`);
  const settings = normalizeSettings(await response.json() as CustomPanelSettings);
  if (typeof window === "undefined" || settings.revision !== 0) return settings;

  const hasLegacyStorage = window.localStorage.getItem(CUSTOM_PANELS_ENABLED_KEY) !== null
    || window.localStorage.getItem(CUSTOM_PANEL_INSTALLATIONS_KEY) !== null;
  if (!hasLegacyStorage) return settings;

  const legacy = readCustomPanelStorage();
  if (!legacy.enabled && legacy.installations.length === 0) {
    clearCustomPanelStorage();
    return { ...settings, corruptRecords: legacy.corruptRecords };
  }
  const migrated = await updateCustomPanelSettings({
    enabled: legacy.enabled,
    installations: legacy.installations,
    expectedRevision: 0,
  });
  clearCustomPanelStorage();
  return { ...migrated, corruptRecords: legacy.corruptRecords };
}

export function useCustomPanelAccountSettings(active = true): CustomPanelAccountSnapshot {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: CUSTOM_PANEL_SETTINGS_QUERY_KEY,
    queryFn: fetchCustomPanelSettings,
    enabled: active,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === CUSTOM_PANEL_ACCOUNT_EVENT_KEY) {
        void queryClient.invalidateQueries({ queryKey: CUSTOM_PANEL_SETTINGS_QUERY_KEY });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [active, queryClient]);

  if (!active) return { enabled: false, installations: [], corruptRecords: 0, revision: 0, loading: false, error: null };
  if (query.data) return query.data;
  return {
    enabled: false,
    installations: [],
    corruptRecords: 0,
    revision: 0,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  };
}

export function useUpdateCustomPanelAccountSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCustomPanelSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(CUSTOM_PANEL_SETTINGS_QUERY_KEY, settings);
      if (typeof window !== "undefined") window.localStorage.setItem(CUSTOM_PANEL_ACCOUNT_EVENT_KEY, String(settings.revision));
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: CUSTOM_PANEL_SETTINGS_QUERY_KEY });
    },
  });
}
