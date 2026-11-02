import { isCustomPanelRef } from "@/pages/Instance/EventsPanels/custom/pluginTypes";
import { isLuaPanelRef } from "@/pages/Instance/EventsPanels/LuaPanel/luaPanelRegistry";

export interface UIUsagePayload {
  preset?: string;
  panels?: string[];
  selected?: string[];
}

export function usagePanelType(panelType: string): string | null {
  if (panelType === "empty") return null;
  if (isCustomPanelRef(panelType)) return "custom";
  if (isLuaPanelRef(panelType)) return "lua";
  return panelType;
}

export function buildUIUsagePayload(preset: string | null, panelTypes: readonly string[]): UIUsagePayload {
  return {
    ...(preset ? { preset } : {}),
    panels: panelTypes
      .map(usagePanelType)
      .filter((panel): panel is string => panel !== null)
      .sort(),
  };
}

export function uiUsageSignature(preset: string | null, panelTypes: readonly string[]): string {
  return JSON.stringify({
    ...(preset ? { preset } : {}),
    panels: panelTypes.filter((panel) => panel !== "empty").sort(),
  });
}

const PANEL_CHOICE_BATCH_SIZE = 32;

export interface PanelChoiceBatcher {
  select: (panelType: string) => void;
  dispose: () => void;
}

export function createPanelChoiceBatcher(
  send: (payload: UIUsagePayload) => void = reportUIUsage,
  delayMs = 750,
): PanelChoiceBatcher {
  let selected: string[] = [];
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    if (selected.length === 0) return;
    const batch = selected;
    selected = [];
    send({ selected: batch });
  };

  return {
    select(panelType: string) {
      const normalized = usagePanelType(panelType);
      if (!normalized) return;
      selected.push(normalized);
      if (selected.length >= PANEL_CHOICE_BATCH_SIZE) {
        flush();
        return;
      }
      if (timeout !== null) clearTimeout(timeout);
      timeout = setTimeout(flush, delayMs);
    },
    dispose() {
      flush();
    },
  };
}

export function reportUIUsage(payload: UIUsagePayload): void {
  void fetch("/api/v1/ui-usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "omit",
    keepalive: true,
  }).catch(() => undefined);
}
