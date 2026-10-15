import { describe, expect, it } from "vitest";
import { galleryPage, TECHNICAL_GALLERY_PAGE_SIZE } from "./galleryPage";

describe("galleryPage", () => {
  const items = Array.from({ length: 61 }, (_, index) => index + 1);

  it("returns at most 25 items with a one-based visible range", () => {
    expect(TECHNICAL_GALLERY_PAGE_SIZE).toBe(25);
    expect(galleryPage(items, 1)).toMatchObject({
      items: items.slice(0, 25),
      page: 1,
      totalPages: 3,
      start: 1,
      end: 25,
    });
    expect(galleryPage(items, 2)).toMatchObject({
      items: items.slice(25, 50),
      page: 2,
      start: 26,
      end: 50,
    });
    expect(galleryPage(items, 3)).toMatchObject({
      items: items.slice(50),
      page: 3,
      start: 51,
      end: 61,
    });
  });

  it("clamps stale pages after filtering", () => {
    expect(galleryPage(items.slice(0, 4), 3)).toEqual({
      items: [1, 2, 3, 4],
      page: 1,
      totalPages: 1,
      start: 1,
      end: 4,
    });
    expect(galleryPage([], 9)).toEqual({
      items: [],
      page: 1,
      totalPages: 1,
      start: 0,
      end: 0,
    });
  });
});
