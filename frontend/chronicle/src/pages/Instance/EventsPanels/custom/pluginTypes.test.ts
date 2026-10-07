import { describe, expect, it } from "vitest";
import { canonicalizeCustomPanelRef, createCustomPanelRef, isManifestV1, normalizeRepository, parseCustomPanelRef } from "./pluginTypes";
import { decodeCustomPanelToken, encodeCustomPanelToken } from "@/hooks/useUrlState";

describe("custom panel references", () => {
  it("normalizes GitHub repository inputs", () => {
    expect(normalizeRepository("https://github.com/Owner/Repo.git")).toBe("owner/repo");
    expect(normalizeRepository("not a repo")).toBeNull();
  });

  it("uses a JSON-safe reference and round trips through the URL token", () => {
    const ref = createCustomPanelRef("Owner/Repo", "raid-cooldowns");
    expect(ref).toBe("custom:github:owner/repo:raid-cooldowns");
    expect(ref).not.toContain("\0");
    expect(parseCustomPanelRef(ref)).toEqual({ source: "github", repository: "owner/repo", panelId: "raid-cooldowns" });
    expect(decodeCustomPanelToken(encodeCustomPanelToken(ref))).toBe(ref);
  });

  it("reads and canonicalizes legacy NUL-delimited references", () => {
    const legacy = "custom:github:owner/repo\0raid-cooldowns";
    expect(parseCustomPanelRef(legacy)).toEqual({ source: "github", repository: "owner/repo", panelId: "raid-cooldowns" });
    expect(canonicalizeCustomPanelRef(legacy)).toBe("custom:github:owner/repo:raid-cooldowns");
    expect(decodeCustomPanelToken(encodeCustomPanelToken(legacy))).toBe("custom:github:owner/repo:raid-cooldowns");
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
