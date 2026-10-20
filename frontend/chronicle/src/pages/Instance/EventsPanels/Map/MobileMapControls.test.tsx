import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MobileMapControls } from "./MobileMapControls";

describe("MobileMapControls", () => {
  it("renders the fullscreen movement, look, exit, and walk controls", () => {
    const markup = renderToStaticMarkup(
      <MobileMapControls
        walking={false}
        canWalk
        onWalkingChange={vi.fn()}
        onInputChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Close 3D world"');
    expect(markup).toContain('aria-label="Movement pad"');
    expect(markup).toContain('aria-label="Look joystick"');
    expect(markup).toContain('aria-label="Jump"');
    expect(markup).toContain("Drop in");
  });

  it("disables drop-in until the world is walkable", () => {
    const markup = renderToStaticMarkup(
      <MobileMapControls
        walking={false}
        canWalk={false}
        onWalkingChange={vi.fn()}
        onInputChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain("disabled");
  });
});
