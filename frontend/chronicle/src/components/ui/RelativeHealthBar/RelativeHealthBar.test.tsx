import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RelativeHealthBar } from "./RelativeHealthBar";
import type { RelativeHealthMessage } from "./relativeHealth";

const messages: RelativeHealthMessage[] = [
  { id: "damage", timestamp: 1, sequence: 1, kind: "damage", amount: 100, prevented: 20 },
  { id: "heal", timestamp: 2, sequence: 2, kind: "healing", amount: 120, overheal: 30 },
];

describe("RelativeHealthBar", () => {
  it("renders the net range, extrema, latest transition, and overheal projection", () => {
    const markup = renderToStaticMarkup(<RelativeHealthBar messages={messages} />);

    expect(markup).toContain("data-current-range");
    expect(markup).toContain("data-minimum-marker");
    expect(markup).toContain("data-maximum-marker");
    expect(markup).toContain("data-current-marker");
    expect(markup).toContain("data-transition-range");
    expect(markup).toContain("data-overheal-range");
    expect(markup).toContain("deficit −10");
  });

  it("renders prevented damage as an avoided leftward range", () => {
    const markup = renderToStaticMarkup(
      <RelativeHealthBar messages={[messages[0]]} />,
    );

    expect(markup).toContain("data-prevented-range");
    expect(markup).toContain("deficit −100");
  });
});
