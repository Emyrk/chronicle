import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InstanceParsesResponse } from "@/api/typesGenerated";
import { buildParsePillMap } from "./parsePills";

function response(overrides: Partial<InstanceParsesResponse> = {}): InstanceParsesResponse {
  return {
    available: true,
    reason: "",
    snapshot_id: "00000000-0000-0000-0000-000000000000",
    cutoff: "2026-11-16T12:00:00Z",
    lookback_days: 60,
    cohort_mode: "spec",
    selected_encounters: ["Ragnaros"],
    metric: "dps",
    players: [],
    invalidations: [],
    ...overrides,
  };
}

describe("buildParsePillMap", () => {
  it("shows an invalidation marker even when the ranking row was removed", () => {
    const pills = buildParsePillMap(response({
      invalidations: [{
        player_guid: "Player-1",
        player_name: "Marigold",
        encounter_name: "Ragnaros",
        reason: "Incorrect specialization",
        invalidated_at: "2026-11-16T12:00:00Z",
      }],
    }), "dps");

    const pill = pills?.get("Player-1");
    expect(pill?.ariaLabel).toBe("Performance invalidated for Ragnaros");
    expect(renderToStaticMarkup(<>{pill?.displayScore}</>)).toContain("lucide-ban");

    const tooltip = renderToStaticMarkup(<>{pill?.tooltipContent}</>);
    expect(tooltip).toContain("Performance invalidated");
    expect(tooltip).toContain("Incorrect specialization");
    expect(tooltip).toContain("does not contribute to parses or rankings");
  });

  it("prefers the invalidation marker over a stale single-boss score", () => {
    const pills = buildParsePillMap(response({
      players: [{
        player_guid: "Player-1",
        player_name: "Marigold",
        player_class: "DRUID",
        player_spec: "Feral",
        player_sub_spec: "",
        player_role: "dps",
        bosses: [{
          encounter_variant: null,
          difficulty_name: "Normal",
          max_players: 40,
          encounter_name: "Ragnaros",
          metric_value: 500,
          precise_score: 95,
          display_score: 95,
          rank: 1,
          sample_size: 100,
          status: "ok",
        }],
        average_parse: null,
        status: "",
        reason: "",
      }],
      invalidations: [{
        player_guid: "Player-1",
        player_name: "Marigold",
        encounter_name: "Ragnaros",
        reason: "Incorrect specialization",
        invalidated_at: "2026-11-16T12:00:00Z",
      }],
    }), "dps");

    expect(pills?.get("Player-1")?.ariaLabel).toBe("Performance invalidated for Ragnaros");
  });
});
