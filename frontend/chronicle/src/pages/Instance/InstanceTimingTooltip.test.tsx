import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstanceTimingTooltip } from "./InstanceTimingTooltip";

describe("InstanceTimingTooltip", () => {
  it("explains raw, ranked clear, boss-to-boss, and combat time", () => {
    const markup = renderToStaticMarkup(
      <InstanceTimingTooltip
        elapsedDurationMs={3_070_000}
        rankedDurationMs={2_800_000}
        bossToBossDurationMs={2_500_000}
        combatDurationMs={1_607_000}
      />,
    );

    expect(markup).toContain("Elapsed time");
    expect(markup).toContain("51m 10s");
    expect(markup).toContain("including downtime");
    expect(markup).toContain("Full raid time");
    expect(markup).toContain("46m 40s");
    expect(markup).toContain("instance-specific start rule");
    expect(markup).toContain("Boss time");
    expect(markup).toContain("41m 40s");
    expect(markup).toContain("first required boss pull");
    expect(markup).toContain("Combat time");
    expect(markup).toContain("26m 47s");
    expect(markup).toContain("excluding downtime");
  });

  it("omits optional leaderboard times when they are unavailable", () => {
    const markup = renderToStaticMarkup(
      <InstanceTimingTooltip
        elapsedDurationMs={3_070_000}
        combatDurationMs={1_607_000}
      />,
    );

    expect(markup).not.toContain("Full raid time");
    expect(markup).not.toContain("Boss time");
  });
});
