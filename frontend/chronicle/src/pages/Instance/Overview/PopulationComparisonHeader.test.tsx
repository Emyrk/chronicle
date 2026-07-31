import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PopulationComparisonHeader } from "./PopulationComparisonHeader";

describe("PopulationComparisonHeader", () => {
  it("shows only the comparison selector for a fixed primary instance", () => {
    const markup = renderToStaticMarkup(<PopulationComparisonHeader heading="Overview" />);

    expect(markup).toContain("Overview");
    expect(markup).toContain("Compare against");
    expect(markup).toContain("No comparison");
    expect(markup).not.toContain("Primary population");
    expect(markup).not.toContain("Reporting scope");
  });

  it("shows both symmetric population selectors on the comparison page", () => {
    const markup = renderToStaticMarkup(<PopulationComparisonHeader showPrimary />);

    expect(markup).toContain("Primary population");
    expect(markup).toContain("Select population");
    expect(markup).toContain("Compare against");
    expect(markup).not.toContain("Overview");
  });

  it("hides comparison controls for an ineligible fixed instance", () => {
    expect(renderToStaticMarkup(
      <PopulationComparisonHeader comparisonEligible={false} />,
    )).toBe("");
  });

  it("keeps the instance Overview heading when comparisons are unavailable", () => {
    const markup = renderToStaticMarkup(
      <PopulationComparisonHeader heading="Overview" comparisonEligible={false} />,
    );

    expect(markup).toContain("Overview");
    expect(markup).not.toContain("Compare against");
  });
});
