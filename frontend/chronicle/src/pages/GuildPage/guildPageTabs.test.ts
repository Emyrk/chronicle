import { describe, expect, it } from "vitest";
import type { GuildPageTab } from "@/api/typesGenerated";
import { moveGuildPageTab, orderGuildPageTabs } from "./guildPageTabs";

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

describe("orderGuildPageTabs", () => {
  it("orders tabs by sort order", () => {
    const tabs = [tab("third", "third", 2), tab("first", "first", 0), tab("second", "second", 1)];

    expect(orderGuildPageTabs(tabs).map((item) => item.id)).toEqual(["first", "second", "third"]);
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
