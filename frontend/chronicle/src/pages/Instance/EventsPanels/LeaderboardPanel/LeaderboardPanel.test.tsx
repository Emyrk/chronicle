import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LeaderboardDetails } from "./LeaderboardPanel";
import { QUALIFIED_FIXTURE_SPEEDRUN } from "./explain/fixture";

describe("LeaderboardDetails", () => {
  it("shows full raid, boss, and raw times for qualified runs", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardDetails speedrun={QUALIFIED_FIXTURE_SPEEDRUN} />,
    );

    expect(markup).toContain("Full raid");
    expect(markup).toContain("2h 10m 24s");
    expect(markup).toContain("Boss time");
    expect(markup).toContain("2h 0m 24s");
    expect(markup).toContain("Raw time");
    expect(markup).toContain("2h 23m 44s");
  });

  it("does not substitute raw time when ranked clear timing is unavailable", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardDetails
        speedrun={{
          ...QUALIFIED_FIXTURE_SPEEDRUN,
          ranked_start_time: undefined,
          ranked_completion_time: undefined,
          ranked_duration_ms: undefined,
        }}
      />,
    );

    expect(markup).toContain("Unavailable");
    expect(markup.match(/2h 23m 44s/g)).toHaveLength(1);
  });
});
