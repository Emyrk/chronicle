import { describe, expect, it } from "vitest";
import { createCustomPanelRef, isManifestV1, normalizeRepository, parseCustomPanelRef } from "./pluginTypes";
import { decodeCustomPanelToken, encodeCustomPanelToken } from "@/hooks/useUrlState";

describe("custom panel references", () => {
  it("normalizes GitHub repository inputs", () => {
    expect(normalizeRepository("https://github.com/Owner/Repo.git")).toBe("owner/repo");
    expect(normalizeRepository("not a repo")).toBeNull();
  });

  it("round trips through the reserved URL token", () => {
    const ref = createCustomPanelRef("Owner/Repo", "raid-cooldowns");
    expect(parseCustomPanelRef(ref)).toEqual({ source: "github", repository: "owner/repo", panelId: "raid-cooldowns" });
    expect(decodeCustomPanelToken(encodeCustomPanelToken(ref))).toBe(ref);
  });

  it("accepts older manifests without panel descriptions", () => {
    expect(isManifestV1({
      schema_version: 1,
      plugin: { id: "github:owner/repo", name: "Raid Tools", version: "1.0.0" },
      host: { api_version: 1 },
      artifacts: { entry: "dist/panel.js" },
      panels: [{ id: "raid-tools", name: "Raid Tools", streams: ["damage"] }],
    }, "owner/repo")).toBe(true);
  });

  it("rejects oversized panel descriptions", () => {
    expect(isManifestV1({
      schema_version: 1,
      plugin: { id: "github:owner/repo", name: "Raid Tools", version: "1.0.0" },
      host: { api_version: 1 },
      artifacts: { entry: "dist/panel.js" },
      panels: [{ id: "raid-tools", name: "Raid Tools", description: "x".repeat(301), streams: ["damage"] }],
    }, "owner/repo")).toBe(false);
  });

  it("preserves malformed custom tokens as invalid references", () => {
    expect(decodeCustomPanelToken("xzz")).toBe("custom:invalid:zz");
  });
});
