import { describe, expect, it } from "vitest";
import blogPosts from "../../../../assets/turtle/generated/blog-posts.json";
import generalTips from "../../../../assets/turtle/generated/general-tips.json";
import panelHints from "../../../../assets/turtle/generated/panel-hints.json";
import { PANELS } from "@/pages/Instance/EventsPanels/EventsPanel";

type GeneralTip = { id: string; content: string };
type PanelHint = GeneralTip & { panelID: string };

function validateHints(
  general: readonly GeneralTip[],
  panels: readonly PanelHint[],
  validPanelIDs: ReadonlySet<string>,
): void {
  const ids = new Set<string>();
  for (const hint of [...general, ...panels]) {
    if (hint.id.trim() === "" || hint.content.trim() === "") {
      throw new Error("Technical hints require non-empty IDs and content");
    }
    if (ids.has(hint.id)) {
      throw new Error(`Duplicate technical hint ID: ${hint.id}`);
    }
    ids.add(hint.id);
  }

  for (const hint of panels) {
    if (!validPanelIDs.has(hint.panelID)) {
      throw new Error(`Invalid panel ID: ${hint.panelID}`);
    }
  }
}

describe("static technical assets", () => {
  it("keeps every server's static assets identical", () => {
    const assets = import.meta.glob("../../../../assets/*/generated/{blog-posts,general-tips,panel-hints}.json", {
      eager: true,
      import: "default",
    });

    expect(Object.keys(assets)).toHaveLength(24);
    for (const [path, value] of Object.entries(assets)) {
      if (path.endsWith("/blog-posts.json")) expect(value).toEqual(blogPosts);
      if (path.endsWith("/general-tips.json")) expect(value).toEqual(generalTips);
      if (path.endsWith("/panel-hints.json")) expect(value).toEqual(panelHints);
    }
  });

  it("has unique, non-empty hint IDs and content with valid panel IDs", () => {
    expect(() => validateHints(generalTips, panelHints, new Set(Object.keys(PANELS)))).not.toThrow();
    expect(panelHints.length).toBeGreaterThan(0);
    expect(panelHints.length).toBeLessThan(Object.keys(PANELS).length);
  });

  it("rejects duplicate IDs", () => {
    expect(() => validateHints(
      [{ id: "duplicate", content: "First" }],
      [{ id: "duplicate", panelID: "comparison", content: "Second" }],
      new Set(Object.keys(PANELS)),
    )).toThrow("Duplicate technical hint ID: duplicate");
  });

  it("rejects invalid panel IDs", () => {
    expect(() => validateHints(
      [],
      [{ id: "invalid-panel", panelID: "not_a_panel", content: "Nope" }],
      new Set(Object.keys(PANELS)),
    )).toThrow("Invalid panel ID: not_a_panel");
  });

  it("rejects empty content", () => {
    expect(() => validateHints(
      [{ id: "empty", content: "" }],
      [],
      new Set(Object.keys(PANELS)),
    )).toThrow("Technical hints require non-empty IDs and content");
  });
});
