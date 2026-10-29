import { describe, expect, it } from "vitest";
import type { LandingFeaturedRun } from "@/api/typesGenerated";
import { heroWindow } from "./heroReplay";

const run: LandingFeaturedRun = {
  instance_id: "run",
  instance_name: "Zul'Gurub",
  duration_ms: 3_600_000,
  player_count: 20,
  bosses: [
    { id: "jeklik", name: "High Priestess Jeklik", kill: true, start_offset_ms: 600_000, end_offset_ms: 700_000 },
    { id: "hakkar", name: "Hakkar", kill: true, start_offset_ms: 3_000_000, end_offset_ms: 3_200_000 },
  ],
  deaths: [
    { offset_ms: 650_000, victim_name: "Early", victim_class: "PRIEST" },
    { offset_ms: 3_100_000, victim_name: "During", victim_class: "MAGE", killer_name: "Hakkar" },
  ],
  upload: { source: "sidekick", delay_ms: null },
  encounter: { id: "hakkar", name: "Hakkar", kill: true, start_offset_ms: 3_000_000, end_offset_ms: 3_200_000 },
  speedrun: null,
};

describe("heroWindow", () => {
  it("scopes the run to the boss pull, from a few seconds before it", () => {
    const { window, run: shown } = heroWindow(run);
    expect(window).toEqual({ encounterId: "hakkar", startOffsetMs: 2_995_000, endOffsetMs: 3_200_000 });
    expect(shown.duration_ms).toBe(205_000);
    expect(shown.bosses).toEqual([{ id: "hakkar", name: "Hakkar", kill: true, start_offset_ms: 5_000, end_offset_ms: 205_000 }]);
    expect(shown.deaths).toEqual([{ offset_ms: 105_000, victim_name: "During", victim_class: "MAGE", killer_name: "Hakkar" }]);
  });

  it("scopes the run to the boss pull the rail picked", () => {
    const { window, run: shown } = heroWindow(run, "jeklik");
    expect(window).toEqual({ encounterId: "jeklik", startOffsetMs: 595_000, endOffsetMs: 700_000 });
    expect(shown.duration_ms).toBe(105_000);
    expect(shown.bosses).toEqual([{ id: "jeklik", name: "High Priestess Jeklik", kill: true, start_offset_ms: 5_000, end_offset_ms: 105_000 }]);
    expect(shown.deaths).toEqual([{ offset_ms: 55_000, victim_name: "Early", victim_class: "PRIEST" }]);
    expect(heroWindow(run, "gone").window?.encounterId).toBe("hakkar");
  });

  it("plays a run without a boss pull whole", () => {
    const whole = { ...run, encounter: null };
    expect(heroWindow(whole)).toEqual({ window: null, run: whole });
  });
});
