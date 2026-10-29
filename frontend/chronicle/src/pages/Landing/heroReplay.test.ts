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
  it("scopes the run to the boss pull, from its start", () => {
    const { window, run: shown } = heroWindow(run);
    expect(window).toEqual({ encounterId: "hakkar", startOffsetMs: 3_000_000, endOffsetMs: 3_200_000 });
    expect(shown.duration_ms).toBe(200_000);
    expect(shown.bosses).toEqual([{ id: "hakkar", name: "Hakkar", kill: true, start_offset_ms: 0, end_offset_ms: 200_000 }]);
    expect(shown.deaths).toEqual([{ offset_ms: 100_000, victim_name: "During", victim_class: "MAGE", killer_name: "Hakkar" }]);
  });

  it("scopes the run to the boss pull the rail picked", () => {
    const { window, run: shown } = heroWindow(run, "jeklik");
    expect(window).toEqual({ encounterId: "jeklik", startOffsetMs: 600_000, endOffsetMs: 700_000 });
    expect(shown.duration_ms).toBe(100_000);
    expect(shown.bosses).toEqual([{ id: "jeklik", name: "High Priestess Jeklik", kill: true, start_offset_ms: 0, end_offset_ms: 100_000 }]);
    expect(shown.deaths).toEqual([{ offset_ms: 50_000, victim_name: "Early", victim_class: "PRIEST" }]);
    expect(heroWindow(run, "gone").window?.encounterId).toBe("hakkar");
  });

  it("plays a run without a boss pull whole", () => {
    const whole = { ...run, encounter: null };
    expect(heroWindow(whole)).toEqual({ window: null, run: whole });
  });
});
