import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  IncomingEventAmount,
  IncomingEventsBreakout,
  type IncomingEventDisplay,
} from "./IncomingEventsBreakout";

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

function renderBreakout(window: "all" | number, events: IncomingEventDisplay[]): string {
  const queryClient = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <IncomingEventsBreakout
        unitName="Tank"
        className="Warrior"
        anchorOffsetMilli={100_000}
        anchorAbsoluteMilli={1_000_000}
        events={events}
        window={window}
        onWindowChange={() => {}}
        sharedFightOffsetMilli={window === "all" ? 25_000 : null}
        onSharedFightOffsetChange={() => {}}
        onClose={() => {}}
        windowSuffix="seconds before playhead"
      />
    </QueryClientProvider>,
  );
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

describe("IncomingEventsBreakout window controls", () => {
  it("renders All as selected with a disabled custom input and finite timeline styles", () => {
    const markup = renderBreakout("all", [
      damageEvent({ offsetMilli: 25_000, eventIndex: 1 }),
      damageEvent({ offsetMilli: 110_000, eventIndex: 2 }),
    ]);

    expect(markup).toContain(">All</button>");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("1 events · All available history");
    expect(markup).not.toContain("seconds before playhead");
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("Infinity");
  });

  it("keeps numeric window labels and custom input values", () => {
    const markup = renderBreakout(30, []);

    expect(markup).toContain("value=\"30\"");
    expect(markup).toContain("seconds before playhead");
    expect(markup).toContain("0 events · 30s window");
  });
});
