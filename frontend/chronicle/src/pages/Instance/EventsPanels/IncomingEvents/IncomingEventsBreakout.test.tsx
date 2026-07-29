import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IncomingEventAmount, type IncomingEventDisplay } from "./IncomingEventsBreakout";

function damageEvent(overrides: Partial<IncomingEventDisplay> = {}): IncomingEventDisplay {
  return {
    offsetMilli: 0,
    eventIndex: 1,
    type: "damage",
    amount: 15_692,
    sourceName: "Auto Attack",
    casterName: "Sartharion",
    spellId: null,
    ...overrides,
  };
}

describe("IncomingEventAmount", () => {
  it("renders absorbed and blocked amounts beside damage", () => {
    const markup = renderToStaticMarkup(
      <IncomingEventAmount
        entry={damageEvent({ absorbed: 2_769, blocked: 1_234 })}
      />,
    );

    expect(markup).toContain("-15,692");
    expect(markup).toContain("data-absorbed-amount");
    expect(markup).toContain("2,769");
    expect(markup).toContain("text-blue-300");
    expect(markup).toContain("data-blocked-amount");
    expect(markup).toContain("1,234");
    expect(markup).toContain("text-amber-300");
  });
});
