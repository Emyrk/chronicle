import { describe, expect, it } from "vitest";
import { CONSUMABLES_PAGE_SIZE, paginateConsumables } from "./consumablesPagination";

describe("paginateConsumables", () => {
  const items = Array.from({ length: CONSUMABLES_PAGE_SIZE * 2 + 7 }, (_, index) => index);

  it("limits the mounted items to one page", () => {
    const page = paginateConsumables(items, 1);

    expect(page.items).toHaveLength(CONSUMABLES_PAGE_SIZE);
    expect(page.items[0]).toBe(CONSUMABLES_PAGE_SIZE);
    expect(page.start).toBe(CONSUMABLES_PAGE_SIZE);
    expect(page.end).toBe(CONSUMABLES_PAGE_SIZE * 2);
    expect(page.pageCount).toBe(3);
  });

  it("clamps stale page requests when the result set shrinks", () => {
    const page = paginateConsumables(items.slice(0, 7), 20);

    expect(page.page).toBe(0);
    expect(page.items).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(page.start).toBe(0);
    expect(page.end).toBe(7);
  });

  it("returns an empty first page for an empty result set", () => {
    expect(paginateConsumables([], 0)).toEqual({
      items: [],
      page: 0,
      pageCount: 1,
      start: 0,
      end: 0,
    });
  });
});
