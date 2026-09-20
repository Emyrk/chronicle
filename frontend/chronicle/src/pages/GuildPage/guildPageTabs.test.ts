import { describe, expect, it } from "vitest";
import type { GuildPageTab } from "@/api/typesGenerated";
import { ensureRequiredRaidsTab, moveGuildPageTab, orderGuildPageTabs } from "./guildPageTabs";

function tab(id: string, slug: string, sortOrder: number): GuildPageTab {
  return {
    id,
    label: slug,
    slug,
    sort_order: sortOrder,
    visibility: "all",
    panels: [],
  };
}

function calendarOverview(sortOrder = 0): GuildPageTab {
  return {
    ...tab("overview", "overview", sortOrder),
    label: "Overview",
    panels: [
      {
        id: "calendar-panel",
        panel_type: "calendar",
        config: {},
        position: { x: 0, y: 0, w: 12, h: 6 },
        visibility: "all",
      },
    ],
  };
}

describe("ensureRequiredRaidsTab", () => {
  it("appends a Raids tab to custom guild pages", () => {
    const tabs = ensureRequiredRaidsTab(
      [tab("overview", "overview", 0)],
      "11111111-1111-1111-1111-111111111111",
    );

    expect(tabs.map((item) => item.slug)).toEqual(["overview", "calendar"]);
    expect(tabs[1]).toMatchObject({
      label: "Raids",
      visibility: "all",
      panels: [
        {
          panel_type: "calendar",
          position: { x: 0, y: 0, w: 12, h: 6 },
          visibility: "all",
        },
      ],
    });
  });

  it("reuses a saved Overview tab that only contains a calendar", () => {
    const tabs = ensureRequiredRaidsTab(
      [calendarOverview()],
      "11111111-1111-1111-1111-111111111111",
    );

    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      id: "overview",
      label: "Raids",
      slug: "overview",
    });
  });

  it("does not append Raids to a default page without a calendar panel", () => {
    const tabs = [tab("overview", "overview", 0)];

    expect(ensureRequiredRaidsTab(tabs, "00000000-0000-0000-0000-000000000000")).toEqual(tabs);
  });

  it("renames an existing Calendar tab to Raids without duplicating it", () => {
    const tabs = ensureRequiredRaidsTab(
      [tab("calendar", "calendar", 0)],
      "11111111-1111-1111-1111-111111111111",
    );

    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ label: "Raids", slug: "calendar" });
  });

  it("renames the default calendar-only Overview to Raids", () => {
    const tabs = ensureRequiredRaidsTab(
      [calendarOverview()],
      "00000000-0000-0000-0000-000000000000",
    );

    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ label: "Raids", slug: "overview" });
  });
});

describe("orderGuildPageTabs", () => {
  it("orders tabs by sort order", () => {
    const tabs = [tab("third", "third", 2), tab("first", "first", 0), tab("second", "second", 1)];

    expect(orderGuildPageTabs(tabs).map((item) => item.id)).toEqual(["first", "second", "third"]);
  });

  it("always places Raids last", () => {
    const tabs = [tab("calendar", "calendar", 0), tab("overview", "overview", 1), tab("roster", "roster", 2)];

    expect(orderGuildPageTabs(tabs).map((item) => item.slug)).toEqual(["overview", "roster", "calendar"]);
  });

  it("places a legacy calendar-only Overview last", () => {
    const tabs = [calendarOverview(0), tab("roster", "roster", 1)];

    expect(orderGuildPageTabs(tabs).map((item) => item.id)).toEqual(["roster", "overview"]);
  });

  it("uses stable tab fields to break duplicate sort order ties", () => {
    const tabs = [tab("b", "beta", 0), tab("a", "alpha", 0)];

    expect(orderGuildPageTabs(tabs).map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("moveGuildPageTab", () => {
  it("moves a tab and normalizes every sort order", () => {
    const tabs = [tab("first", "first", 0), tab("second", "second", 1), tab("third", "third", 2)];

    const moved = moveGuildPageTab(tabs, "third", "up");

    expect(moved.map((item) => item.id)).toEqual(["first", "third", "second"]);
    expect(moved.map((item) => item.sort_order)).toEqual([0, 1, 2]);
  });

  it("does not move a tab beyond the list boundary", () => {
    const tabs = [tab("first", "first", 0), tab("second", "second", 1)];

    expect(moveGuildPageTab(tabs, "first", "up").map((item) => item.id)).toEqual(["first", "second"]);
    expect(moveGuildPageTab(tabs, "second", "down").map((item) => item.id)).toEqual(["first", "second"]);
  });
});
