import { describe, expect, it } from "vitest";
import type { StatusTimelineEvent } from "./status.processor";
import { statusIncomingHealthPreview } from "./statusIncomingHealth";

function event(overrides: Partial<StatusTimelineEvent>): StatusTimelineEvent {
  return {
    timestampMilli: 0,
    offsetMilli: 0,
    eventIndex: 0,
    kind: "damage",
    amount: 0,
    spellId: null,
    label: "event",
    sourceId: "source",
    sourceName: "Source",
    targetId: "target",
    ...overrides,
  };
}

describe("statusIncomingHealthPreview", () => {
  it("orders incoming events and totals damage plus effective healing", () => {
    const preview = statusIncomingHealthPreview([
      event({ timestampMilli: 2_400, eventIndex: 3, kind: "heal", amount: 900, overheal: 300, sourceName: "Healer" }),
      event({ timestampMilli: 1_400, eventIndex: 2, kind: "damage", amount: 1_200, sourceName: "Boss" }),
      event({ timestampMilli: 1_200, eventIndex: 1, kind: "cast", amount: 0 }),
    ], 1_000);

    expect(preview.events.map((item) => item.sourceName)).toEqual(["Boss", "Healer"]);
    expect(preview.damage).toBe(1_200);
    expect(preview.healing).toBe(600);
  });

  it("limits damage to 0.5 seconds and healing to 1.5 seconds", () => {
    const preview = statusIncomingHealthPreview([
      event({ timestampMilli: 1_500, eventIndex: 1, kind: "damage", amount: 500, sourceName: "Included damage" }),
      event({ timestampMilli: 1_501, eventIndex: 2, kind: "damage", amount: 900, sourceName: "Excluded damage" }),
      event({ timestampMilli: 2_500, eventIndex: 3, kind: "heal", amount: 700, sourceName: "Included heal" }),
      event({ timestampMilli: 2_501, eventIndex: 4, kind: "heal", amount: 800, sourceName: "Excluded heal" }),
    ], 1_000);

    expect(preview.events.map((item) => item.sourceName)).toEqual(["Included damage", "Included heal"]);
    expect(preview.damage).toBe(500);
    expect(preview.healing).toBe(700);
  });
});
