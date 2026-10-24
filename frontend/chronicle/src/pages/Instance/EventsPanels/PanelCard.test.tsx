import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PanelCard } from "./PanelCard";

describe("PanelCard", () => {
  it("lets content-height panels establish their intrinsic height without a card back", () => {
    const markup = renderToStaticMarkup(
      <PanelCard
        flipped={false}
        contentHeight
        bleed
        front={<div data-testid="front">Timeline</div>}
        back={null}
      />,
    );

    expect(markup).toContain("[grid-area:1/1]");
    expect(markup).toContain("Timeline");
    expect(markup).not.toContain("[transform:rotateY(180deg)]");
  });
});
