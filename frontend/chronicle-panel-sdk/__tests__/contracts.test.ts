import { describe, expect, it } from "vitest";
import type {
  ChroniclePanelBreakoutOptionsV1,
  ChroniclePanelSnapshotV1,
} from "../src/v1";
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

  it("accepts breakout close notifications", () => {
    const options: ChroniclePanelBreakoutOptionsV1 = {
      title: "Details",
      onClose: () => {},
    };

    expect(options.onClose).toBeTypeOf("function");
  });

  it("exposes optional guild context in panel snapshots", () => {
    const snapshot: ChroniclePanelSnapshotV1 = {
      instance: {
        id: "instance-id",
        title: "Molten Core",
        guild: { id: "guild-id", name: "Raid Guild" },
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-01-01T01:00:00Z",
        capabilities: [],
        encounters: [],
        players: {},
        units: {},
      },
      selection: { encounterIds: [], playerIds: [], enemyIds: [] },
      sync: { enabled: false, playing: false, timestampMs: null },
      panel: {
        panelInstanceId: "panel-id",
        option: null,
        width: 800,
        height: 600,
        renderMode: "default",
        poppedOut: false,
      },
      theme: { mode: "dark" },
    };

    expect(snapshot.instance.guild).toEqual({
      id: "guild-id",
      name: "Raid Guild",
    });

    delete snapshot.instance.guild;
    expect(snapshot.instance.guild).toBeUndefined();
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
