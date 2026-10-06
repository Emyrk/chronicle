import { describe, expect, it } from "vitest";
import { CUSTOM_PANEL_INSTALLATIONS_KEY, readCustomPanelStorage, setCustomPanelsEnabled, upsertCustomPanelInstallation } from "./pluginStorage";
import type { CustomPanelInstallationV1 } from "./pluginTypes";

const installation: CustomPanelInstallationV1 = {
  repository: "owner/repo", commitSha: "a".repeat(40), installedRef: "main",
  manifest: { schema_version: 1, plugin: { id: "github:owner/repo", name: "Test", version: "1" }, host: { api_version: 1 }, artifacts: { entry: "dist/panel.js" }, panels: [{ id: "test", name: "Test", streams: ["damage"] }] },
  manifestSha256: "hash", artifacts: { entry: { url: "/entry", sha256: "hash", size: 1 } }, enabled: true,
  installedAt: "2026-10-06T00:00:00.000Z", updatedAt: "2026-10-06T00:00:00.000Z",
};

describe("custom panel storage", () => {
  it("defaults globally disabled and validates records", () => {
    const storage = new MapStorage();
    expect(readCustomPanelStorage(storage).enabled).toBe(false);
    storage.setItem(CUSTOM_PANEL_INSTALLATIONS_KEY, JSON.stringify([installation, { bad: true }]));
    expect(readCustomPanelStorage(storage)).toMatchObject({ installations: [installation], corruptRecords: 1 });
  });

  it("stores enable state and installations without evaluating plugin code", () => {
    const storage = new MapStorage();
    setCustomPanelsEnabled(true, storage);
    upsertCustomPanelInstallation(installation, storage);
    expect(readCustomPanelStorage(storage)).toMatchObject({ enabled: true, installations: [installation] });
  });
});

class MapStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
