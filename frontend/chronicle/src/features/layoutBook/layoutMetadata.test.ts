import { describe, expect, it } from "vitest";
import { findLayoutTitleConflict, uniqueLayoutTitle } from "./layoutMetadata";

const layouts = [
  { id: "a", title: "Raid Night" },
  { id: "b", title: "My layout" },
  { id: "c", title: "My layout 2" },
];

describe("findLayoutTitleConflict", () => {
  it("matches titles ignoring case and surrounding spaces", () => {
    expect(findLayoutTitleConflict("  raid NIGHT ", layouts)?.id).toBe("a");
  });

  it("lets a layout keep its own title when overwriting it", () => {
    expect(findLayoutTitleConflict("Raid Night", layouts, "a")).toBeUndefined();
    expect(findLayoutTitleConflict("My layout", layouts, "a")?.id).toBe("b");
  });

  it("ignores empty titles and new names", () => {
    expect(findLayoutTitleConflict("   ", layouts)).toBeUndefined();
    expect(findLayoutTitleConflict("Raid Night Two", layouts)).toBeUndefined();
  });
});

describe("uniqueLayoutTitle", () => {
  it("keeps an unused title", () => {
    expect(uniqueLayoutTitle("Healer View", layouts)).toBe("Healer View");
  });

  it("adds the first free number to a used title", () => {
    expect(uniqueLayoutTitle("Raid Night", layouts)).toBe("Raid Night 2");
    expect(uniqueLayoutTitle("my LAYOUT", layouts)).toBe("my LAYOUT 3");
  });
});
