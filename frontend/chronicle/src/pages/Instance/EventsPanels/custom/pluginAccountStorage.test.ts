import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCustomPanelSettings } from "./pluginAccountStorage";
import {
  CUSTOM_PANEL_INSTALLATIONS_KEY,
  CUSTOM_PANELS_ENABLED_KEY,
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
      sha256: "c".repeat(64),
      size: 1,
    },
  },
  enabled: true,
  installedAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-06T00:00:00Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("fetchCustomPanelSettings", () => {
  it("migrates legacy local settings into an empty account once", async () => {
    const storage = new MapStorage();
    storage.setItem(CUSTOM_PANELS_ENABLED_KEY, "true");
    storage.setItem(
      CUSTOM_PANEL_INSTALLATIONS_KEY,
      JSON.stringify([installation]),
    );
    vi.stubGlobal("window", { localStorage: storage });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ enabled: false, installations: [], revision: 0 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            enabled: true,
            installations: [installation],
            revision: 1,
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCustomPanelSettings()).resolves.toMatchObject({
      enabled: true,
      installations: [installation],
      revision: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({ enabled: true, expected_revision: 0 });
    expect(storage.getItem(CUSTOM_PANELS_ENABLED_KEY)).toBeNull();
    expect(storage.getItem(CUSTOM_PANEL_INSTALLATIONS_KEY)).toBeNull();
  });

  it("does not overwrite existing account settings", async () => {
    const storage = new MapStorage();
    storage.setItem(CUSTOM_PANELS_ENABLED_KEY, "true");
    vi.stubGlobal("window", { localStorage: storage });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ enabled: false, installations: [], revision: 2 }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCustomPanelSettings()).resolves.toMatchObject({
      enabled: false,
      revision: 2,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(storage.getItem(CUSTOM_PANELS_ENABLED_KEY)).toBe("true");
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
