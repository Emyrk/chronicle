import { describe, expect, it } from "vitest";
import {
  clearCustomPanelStorage,
  CUSTOM_PANEL_INSTALLATIONS_KEY,
  CUSTOM_PANELS_ENABLED_KEY,
  readCustomPanelStorage,
} from "./pluginStorage";
import type { CustomPanelInstallationV1 } from "./pluginTypes";

const installation: CustomPanelInstallationV1 = {
  repository: "owner/repo",
  commitSha: "a".repeat(40),
  installedRef: "main",
  manifest: {
    schema_version: 1,
    plugin: { id: "github:owner/repo", name: "Test", version: "1" },
    host: { api_version: 1 },
    artifacts: {
      entry: { path: "dist/panel.js", sha256: "d".repeat(64), size: 1 },
    },
    panels: [{ id: "test", name: "Test", streams: ["damage"] }],
  },
  manifestSha256: "b".repeat(64),
  artifacts: {
    entry: {
      url:
        "https://raw.githubusercontent.com/owner/repo/" +
        "a".repeat(40) +
        "/dist/panel.js",
      sha256: "d".repeat(64),
      size: 1,
    },
  },
  enabled: true,
  installedAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-10-06T00:00:00.000Z",
};

describe("custom panel storage", () => {
  it("defaults globally disabled and validates records", () => {
    const storage = new MapStorage();
    expect(readCustomPanelStorage(storage).enabled).toBe(false);
    storage.setItem(
      CUSTOM_PANEL_INSTALLATIONS_KEY,
      JSON.stringify([installation, { bad: true }]),
    );
    expect(readCustomPanelStorage(storage)).toMatchObject({
      installations: [installation],
      corruptRecords: 1,
    });
  });

  it("clears legacy account settings after migration", () => {
    const storage = new MapStorage();
    storage.setItem(CUSTOM_PANELS_ENABLED_KEY, "true");
    storage.setItem(
      CUSTOM_PANEL_INSTALLATIONS_KEY,
      JSON.stringify([installation]),
    );
    clearCustomPanelStorage(storage);
    expect(readCustomPanelStorage(storage)).toMatchObject({
      enabled: false,
      installations: [],
    });
  });
});

class MapStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
