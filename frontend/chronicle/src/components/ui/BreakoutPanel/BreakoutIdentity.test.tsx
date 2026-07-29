import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BreakoutIdentity } from "./BreakoutIdentity";

describe("BreakoutIdentity", () => {
  it("renders the compact shared circle, name, and class treatment", () => {
    const markup = renderToStaticMarkup(
      <BreakoutIdentity color="#69ccf0" name="Mageplayer" className="MAGE" />,
    );

    expect(markup).toContain("data-breakout-identity");
    expect(markup).toContain("h-2 w-2");
    expect(markup).toContain("Mageplayer");
    expect(markup).toContain("MAGE");
    expect(markup).toContain("#69ccf0");
  });
});
