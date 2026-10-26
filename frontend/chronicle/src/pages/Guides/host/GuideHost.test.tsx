import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { applySceneBatch, createInitialScene, UI_ROOT_ID } from "../protocol";
import { GuideUiScene, TrustedGuideControls } from "./GuideHost";

describe("trusted guide layer", () => {
  it("is an absolute high-z host sibling and never a retained scene node", () => {
    const markup = renderToStaticMarkup(
      <TrustedGuideControls
        status="running"
        guideName="Onyxia's Lair"
        fullscreen={false}
        walking={false}
        canWalk
        onStart={vi.fn()}
        onStop={vi.fn()}
        onRestart={vi.fn()}
        onFullscreen={vi.fn()}
        onWalkingChange={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    expect(markup).toContain("data-guide-trusted-controls");
    expect(markup).toContain("absolute");
    expect(markup).toContain("z-[1000]");
    expect(markup).not.toContain("data-guide-node");
    expect(markup).toContain('aria-label="Exit guide"');
    expect(markup).toContain('aria-label="Enter walk mode"');
  });

  it("renders UI parentage, anchor transforms, and scroll styling from the retained scene", () => {
    const scene = applySceneBatch(createInitialScene(), [
      { op: "create", id: "panel", kind: "frame", parentId: UI_ROOT_ID, props: { x: 400, y: 200, width: 300, height: 160, anchor: "center", backgroundColor: "#000000" } },
      { op: "create", id: "copy", kind: "text", parentId: "panel", props: { x: 12, y: 12, width: 276, height: 80, anchor: "top-left", text: "Keep scrolling", fontSize: 14, color: "#ffffff" } },
      { op: "create", id: "action", kind: "button", parentId: "panel", props: { x: 150, y: 140, width: 100, height: 28, anchor: "bottom", text: "Continue", enabled: true } },
    ]);
    const markup = renderToStaticMarkup(<GuideUiScene scene={scene} assets={new Map()} onNodeClick={vi.fn()} />);
    expect(markup.indexOf('data-guide-node="panel"')).toBeLessThan(markup.indexOf('data-guide-node="copy"'));
    expect(markup).toContain("translate(-50%, -50%)");
    expect(markup).toContain("styled-scrollbar");
    expect(markup).toContain("Keep scrolling");
  });
});
