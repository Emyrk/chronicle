import { describe, expect, it } from "vitest";
import type { PopulationSelection } from "./populationSelectionState";
import {
  selectTimeParseScopeResult,
  timeParseScopeForComparison,
  type ScopedInstanceTimeParsesResponse,
  type TimeParseScopeResult,
} from "./timeParseScope";

function scopeResult(displayScore: number, available = true): TimeParseScopeResult {
  return {
    available,
    boss_kill_times: [],
    clear_time: {
      duration_ms: 1_000,
      precise_score: displayScore,
      display_score: displayScore,
      rank: 1,
      sample_size: 20,
      status: "scored",
    },
  };
}

function response(
  scopes?: Readonly<Record<string, TimeParseScopeResult>>,
): ScopedInstanceTimeParsesResponse {
  return {
    available: true,
    cutoff: "2026-10-01T00:00:00Z",
    lookback_days: 60,
    policy_version: 1,
    query_version: 1,
    computed_at: "2026-10-01T00:00:00Z",
    boss_kill_times: [],
    clear_time: scopeResult(91).clear_time,
    scopes,
  };
}

function cohort(scope: "server" | "realm" | "guild"): PopulationSelection {
  return {
    kind: "cohort",
    scope,
    anchorInstanceId: "raid-1",
    lookbackDays: 60,
  };
}

describe("timeParseScopeForComparison", () => {
  it("defaults no comparison and another raid to server", () => {
    expect(timeParseScopeForComparison(undefined)).toBe("server");
    expect(timeParseScopeForComparison({ kind: "instance", instanceId: "raid-2" })).toBe("server");
  });

  it.each(["server", "realm", "guild"] as const)("uses the %s cohort scope", (scope) => {
    expect(timeParseScopeForComparison(cohort(scope))).toBe(scope);
  });
});

describe("selectTimeParseScopeResult", () => {
  const server = scopeResult(90);
  const realm = scopeResult(80);
  const guild = scopeResult(70);
  const scopedResponse = response({ server, realm, guild });

  it("selects the matching persisted cohort scope", () => {
    expect(selectTimeParseScopeResult(scopedResponse, cohort("server"))).toBe(server);
    expect(selectTimeParseScopeResult(scopedResponse, cohort("realm"))).toBe(realm);
    expect(selectTimeParseScopeResult(scopedResponse, cohort("guild"))).toBe(guild);
  });

  it("uses server scope without a comparison or for another raid", () => {
    expect(selectTimeParseScopeResult(scopedResponse, undefined)).toBe(server);
    expect(selectTimeParseScopeResult(
      scopedResponse,
      { kind: "instance", instanceId: "raid-2" },
    )).toBe(server);
  });

  it("falls back to the top-level compatibility payload only for server scope", () => {
    const compatibilityResponse = response();

    expect(selectTimeParseScopeResult(compatibilityResponse, undefined)).toBe(compatibilityResponse);
    expect(selectTimeParseScopeResult(compatibilityResponse, cohort("server"))).toBe(compatibilityResponse);
    expect(selectTimeParseScopeResult(compatibilityResponse, cohort("realm"))).toBeUndefined();
    expect(selectTimeParseScopeResult(compatibilityResponse, cohort("guild"))).toBeUndefined();
  });

  it("preserves an unavailable selected scope so callers can render its reason", () => {
    const unavailableGuild = { ...guild, available: false, reason: "sample_too_small" };
    const result = selectTimeParseScopeResult(
      response({ server, realm, guild: unavailableGuild }),
      cohort("guild"),
    );

    expect(result).toBe(unavailableGuild);
    expect(result?.reason).toBe("sample_too_small");
  });
});
