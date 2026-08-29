import { describe, expect, it } from "vitest";
import type { Encounter } from "../../InstancePage";
import {
  createTimelinePhaseAnnotations,
  groupTimelineDeathAnnotations,
} from "./timelineAnnotations";

function encounter(
  id: string,
  startTime: string,
  phases: Encounter["phases"] = [],
): Encounter {
  return {
    id,
    name: id,
    boss: true,
    kill_type: "clean",
    start_time: startTime,
    end_time: startTime,
    phases,
  };
}

describe("timeline annotations", () => {
  it("positions phases against the first selected encounter", () => {
    const encounters = [
      encounter("first", "2026-08-29T12:00:00Z", [{
        id: "phase-1",
        encounter_id: "first",
        key: "one",
        name: "Phase One",
        order: 1,
        start_offset_ms: 5_000,
        end_offset_ms: 15_000,
        start_time: "2026-08-29T12:00:05Z",
        end_time: "2026-08-29T12:00:15Z",
        kill_type: "clean",
      }]),
      encounter("second", "2026-08-29T12:01:00Z", [{
        id: "phase-2",
        encounter_id: "second",
        key: "two",
        name: "Phase Two",
        order: 1,
        start_offset_ms: 2_000,
        end_offset_ms: 8_000,
        start_time: "2026-08-29T12:01:02Z",
        end_time: "2026-08-29T12:01:08Z",
        kill_type: "clean",
      }]),
    ];

    expect(createTimelinePhaseAnnotations(encounters, ["second", "first"])).toEqual([
      { id: "phase-1", name: "Phase One", startSec: 5, endSec: 15 },
      { id: "phase-2", name: "Phase Two", startSec: 62, endSec: 68 },
    ]);
  });

  it("groups simultaneous player deaths", () => {
    expect(groupTimelineDeathAnnotations([
      { offsetMs: 7_500, playerId: "a", playerName: "Alice", className: "MAGE" },
      { offsetMs: 2_000, playerId: "b", playerName: "Bob", className: "WARRIOR" },
      { offsetMs: 7_500, playerId: "c", playerName: "Cara", className: "PRIEST" },
    ])).toEqual([
      {
        offsetSec: 2,
        deaths: [{ offsetMs: 2_000, playerId: "b", playerName: "Bob", className: "WARRIOR" }],
      },
      {
        offsetSec: 7.5,
        deaths: [
          { offsetMs: 7_500, playerId: "a", playerName: "Alice", className: "MAGE" },
          { offsetMs: 7_500, playerId: "c", playerName: "Cara", className: "PRIEST" },
        ],
      },
    ]);
  });
});
