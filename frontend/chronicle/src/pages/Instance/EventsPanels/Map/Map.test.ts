import { describe, expect, it } from "vitest";
import {
  alignmentOverlayForMapMode,
  createMapPanel,
  mapPresentationForSelection,
  preferredMeshState,
  walkModeAvailable,
} from "./Map";

describe("map presentation", () => {
  it("uses the 3D replay for exactly one selected encounter", () => {
    expect(mapPresentationForSelection(1)).toBe("replay-3d");
    expect(mapPresentationForSelection(1, true)).toBe("replay-3d");
  });

  it("uses the 2D route overview for zero or multiple selected encounters", () => {
    expect(mapPresentationForSelection(0)).toBe("overview-2d");
    expect(mapPresentationForSelection(2)).toBe("overview-2d");
    expect(mapPresentationForSelection(8)).toBe("overview-2d");
  });

  it("uses the 3D replay of the whole run when asked, for zero or several encounters", () => {
    expect(mapPresentationForSelection(0, true)).toBe("replay-3d");
    expect(mapPresentationForSelection(8, true)).toBe("replay-3d");
  });

  it("loads the complete encounter while replay controls the presentation cursor", () => {
    expect(createMapPanel().syncDataMode).toBe("full");
  });

  it("exposes fixed camera shortcuts without a settings card", () => {
    const panel = createMapPanel();
    expect(panel.keybinds).not.toBe("dynamic");
    expect(panel.keybinds).toHaveLength(13);
    expect(panel.renderCardBack).toBeUndefined();
  });

  it("turns off the alignment overlay outside mesh mode", () => {
    expect(alignmentOverlayForMapMode(true, true)).toBe(true);
    expect(alignmentOverlayForMapMode(true, false)).toBe(false);
    expect(alignmentOverlayForMapMode(false, true)).toBe(false);
  });

  it("prefers published dungeon meshes until the user explicitly chooses otherwise", () => {
    expect(preferredMeshState(null)).toBe(true);
    expect(preferredMeshState(true)).toBe(true);
    expect(preferredMeshState(false)).toBe(false);
  });

  it("only enables walk mode when the active floor has a usable world scale", () => {
    expect(walkModeAvailable(true, false, "loading", true)).toBe(true);
    expect(walkModeAvailable(true, false, "ready", false)).toBe(false);
    expect(walkModeAvailable(true, true, "loading", true)).toBe(false);
    expect(walkModeAvailable(true, true, "ready", false)).toBe(true);
    expect(walkModeAvailable(false, false, "ready", true)).toBe(false);
  });
});
