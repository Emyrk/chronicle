import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BreakoutIdentity } from "./BreakoutIdentity";

describe("BreakoutIdentity", () => {
  it("renders specialization before class when available", () => {
    const markup = renderToStaticMarkup(
      <BreakoutIdentity
        color="#ff7d0a"
        name="Druidplayer"
        className="DRUID"
        specialization="Feral"
        subSpec="Bear"
      />,
    );

    expect(markup).toContain("data-breakout-identity");
    expect(markup).toContain("h-2 w-2");
    expect(markup).toContain("Druidplayer");
    expect(markup).toContain("FERAL (BEAR) DRUID");
    expect(markup).toContain("#ff7d0a");
  });

  it("keeps the class-only label when specialization is unavailable", () => {
    const markup = renderToStaticMarkup(
      <BreakoutIdentity color="#9482c9" name="Seroneth" className="WARLOCK" />,
    );

    expect(markup).toContain(">WARLOCK</span>");
  });
});
