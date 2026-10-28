import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MapFloorPicker } from "./MapFloorPicker";

describe("MapFloorPicker", () => {
  it("keeps every published floor selectable in an unavailable-layer message", () => {
    const markup = renderToStaticMarkup(
      <MapFloorPicker floors={[1, 2]} value={2} onChange={vi.fn()} />,
    );

    expect(markup).toContain('aria-label="Map floor"');
    expect(markup).toContain('<option value="1">Floor 1</option>');
    expect(markup).toContain('<option value="2" selected="">Floor 2</option>');
  });

  it("does not add a redundant picker for a single-floor instance", () => {
    expect(renderToStaticMarkup(
      <MapFloorPicker floors={[1]} value={1} onChange={vi.fn()} />,
    )).toBe("");
  });
});
