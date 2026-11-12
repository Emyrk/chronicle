import { describe, expect, it } from "vitest";
import type { InstanceRatingEvidenceResponse, InstanceRatingPlayerObservation } from "@/api/typesGenerated";
import { createRatingEvidencePanel } from "./RatingEvidence";
import {
  countRatingEvidence,
  formatDifficultyCohort,
  formatDurationMs,
  formatMetricName,
  formatPlayerCohort,
} from "./ratingEvidenceModel";

const evidence = {
  available: true,
  player: {
    observations: [{}, {}],
    renown: [{}],
  },
  guild: {
    boss_times: [{}, {}, {}],
    clear_times: [{}],
    renown: [{}, {}],
  },
} as unknown as InstanceRatingEvidenceResponse;

describe("Rating Evidence panel", () => {
  it("manages its API-backed data independently with full sync data", () => {
    const panel = createRatingEvidencePanel();

    expect(panel.selfManagesAggregation).toBe(true);
    expect(panel.syncDataMode).toBe("full");
    expect(panel.streams).toEqual([]);
  });

  it("counts player and guild evidence for the tab badges", () => {
    expect(countRatingEvidence(evidence)).toEqual({
      player: 3,
      playerObservations: 2,
      playerRenown: 1,
      guild: 6,
      guildBossTimes: 3,
      guildClearTimes: 1,
      guildRenown: 2,
    });
  });

  it("formats persisted cohorts and metric labels", () => {
    const observation = {
      player_class: "DRUID",
      player_spec: "Feral",
      player_sub_spec: "Bear",
    } as InstanceRatingPlayerObservation;

    expect(formatPlayerCohort(observation)).toBe("DRUID · Feral · Bear");
    expect(formatMetricName("dps")).toBe("DPS");
    expect(formatMetricName("HPS")).toBe("HPS");
  });

  it("formats boss and clear durations without losing milliseconds", () => {
    expect(formatDurationMs(0)).toBe("0s");
    expect(formatDurationMs(65_432)).toBe("1m 05.432s");
    expect(formatDurationMs(3_723_004)).toBe("1h 02m 03.004s");
  });
});

it("distinguishes same-name boss difficulty cohorts including explicit Normal", () => {
  expect(formatDifficultyCohort({ difficulty_name: "", max_players: 25 })).toBe("Normal · 25-player");
  expect(formatDifficultyCohort({ difficulty_name: "heroic", max_players: 25 })).toBe("Heroic · 25-player");
  expect(formatDifficultyCohort({ difficulty_name: "mythic_plus", max_players: 10 })).toBe("Mythic Plus · 10-player");
});
