import { describe, expect, it } from "vitest";
import { normalizeSchedule } from "./RaidSchedule.utils";

describe("raid schedule normalization", () => {
  it("preserves row colors and organizational sections", () => {
    expect(
      normalizeSchedule([
        { day: "", raid: "NA teams", kind: "section", color: "#2563eb" },
        { day: "Wed", raid: "Molten Core", kind: "raid", color: "#2563eb" },
        { day: "", raid: "EU teams", kind: "section", color: "#f59e0b" },
        { day: "Thu", raid: "Blackwing Lair", kind: "raid", color: "#f59e0b" },
      ]),
    ).toMatchObject([
      { raid: "NA teams", kind: "section", color: "#2563eb" },
      { day: "Wed", kind: "raid", color: "#2563eb" },
      { raid: "EU teams", kind: "section", color: "#f59e0b" },
      { day: "Thu", kind: "raid", color: "#f59e0b" },
    ]);
  });

  it("drops empty sections and invalid saved colors", () => {
    expect(
      normalizeSchedule([
        { day: "", raid: "", kind: "section", color: "#123456" },
        { day: "Fri", raid: "AQ40", kind: "raid", color: "orange" },
      ]),
    ).toEqual([
      expect.objectContaining({ day: "Fri", raid: "AQ40", kind: "raid", color: undefined }),
    ]);
  });

  it("continues to parse legacy pipe-separated schedules", () => {
    expect(normalizeSchedule("Wed | Molten Core | 7:30–10:30 | inv 7:00")).toEqual([
      expect.objectContaining({
        day: "Wed",
        raid: "Molten Core",
        kind: "raid",
        time: "7:30–10:30",
        invite: "inv 7:00",
      }),
    ]);
  });
});
