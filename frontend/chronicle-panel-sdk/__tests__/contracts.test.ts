import { describe, expect, it } from "vitest";
import {
  canonicalizeCustomPanelRef,
  createCustomPanelRef,
  CUSTOM_PANEL_BREAKOUT_TITLE_MAX_LENGTH,
  CUSTOM_PANEL_MAX_BREAKOUTS,
  isManifestV1,
  normalizeRepository,
  parseCustomPanelRef,
} from "../src/v1";

describe("custom panel SDK contracts", () => {
  it("publishes bounded floating-breakout limits", () => {
    expect(CUSTOM_PANEL_MAX_BREAKOUTS).toBe(8);
    expect(CUSTOM_PANEL_BREAKOUT_TITLE_MAX_LENGTH).toBe(100);
  });

  it("normalizes GitHub repository inputs", () => {
    expect(normalizeRepository("https://github.com/Owner/Repo.git")).toBe("owner/repo");
    expect(normalizeRepository("not a repo")).toBeNull();
  });

  it("creates canonical JSON-safe panel references", () => {
    const ref = createCustomPanelRef("Owner/Repo", "raid-cooldowns");
    expect(ref).toBe("custom:github:owner/repo:raid-cooldowns");
    expect(parseCustomPanelRef(ref)).toEqual({
      source: "github",
      repository: "owner/repo",
      panelId: "raid-cooldowns",
    });
  });

  it("canonicalizes legacy NUL-delimited references", () => {
    expect(canonicalizeCustomPanelRef("custom:github:owner/repo\0raid-cooldowns"))
      .toBe("custom:github:owner/repo:raid-cooldowns");
  });

  it("validates artifact metadata and every supported stream", () => {
    expect(isManifestV1({
      schema_version: 1,
      plugin: { id: "github:owner/repo", name: "Raid Tools", version: "1.0.0" },
      host: { api_version: 1 },
      artifacts: {
        entry: { path: "dist/panel.js", sha256: "d".repeat(64), size: 1 },
      },
      panels: [{
        id: "raid-tools",
        name: "Raid Tools",
        streams: ["damage", "unit_position", "unit_resources"],
      }],
    }, "owner/repo")).toBe(true);
  });

  it("rejects oversized panel descriptions", () => {
    expect(isManifestV1({
      schema_version: 1,
      plugin: { id: "github:owner/repo", name: "Raid Tools", version: "1.0.0" },
      host: { api_version: 1 },
      artifacts: {
        entry: { path: "dist/panel.js", sha256: "d".repeat(64), size: 1 },
      },
      panels: [{ id: "raid-tools", name: "Raid Tools", description: "x".repeat(301), streams: [] }],
    }, "owner/repo")).toBe(false);
  });
});
