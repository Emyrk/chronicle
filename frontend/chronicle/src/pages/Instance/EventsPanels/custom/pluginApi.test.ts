import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCustomPanelInstallation } from "./pluginApi";
import type { ResolveCustomPanelResponse } from "./pluginTypes";

const response: ResolveCustomPanelResponse = {
  repository: "owner/repo",
  commit_sha: "a".repeat(40),
  manifest: {
    schema_version: 1,
    plugin: { id: "github:owner/repo", name: "Test", version: "1" },
    host: { api_version: 1 },
    artifacts: {
      entry: { path: "dist/panel.js", sha256: "b".repeat(64), size: 1 },
    },
    panels: [{ id: "test", name: "Test", streams: [] }],
  },
  manifest_sha256: "0".repeat(64),
  artifacts: {
    entry: {
      url: `https://raw.githubusercontent.com/owner/repo/${"a".repeat(40)}/dist/panel.js`,
      sha256: "b".repeat(64),
      size: 1,
    },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("resolveCustomPanelInstallation", () => {
  it("rejects a resolver response whose canonical manifest hash does not match", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 }),
    ));

    await expect(resolveCustomPanelInstallation("owner/repo", "main"))
      .rejects.toThrow("invalid canonical SHA-256");
  });
});
