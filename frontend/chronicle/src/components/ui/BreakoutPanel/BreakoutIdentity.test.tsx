import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BreakoutIdentity } from "./BreakoutIdentity";

describe("BreakoutIdentity", () => {
  it("renders specialization before class when available", () => {
    const markup = renderToStaticMarkup(
      <BreakoutIdentity
        color="#69ccf0"
        name="Mageplayer"
        className="MAGE"
        specialization="Fire"
      />,
    );

    expect(markup).toContain("data-breakout-identity");
    expect(markup).toContain("h-2 w-2");
    expect(markup).toContain("Mageplayer");
    expect(markup).toContain("FIRE MAGE");
    expect(markup).toContain("#69ccf0");
  });

  it("keeps the class-only label when specialization is unavailable", () => {
    const markup = renderToStaticMarkup(
      <BreakoutIdentity color="#9482c9" name="Seroneth" className="WARLOCK" />,
    );

    expect(markup).toContain(">WARLOCK</span>");
  });
});
