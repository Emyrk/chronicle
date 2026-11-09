import type { ChangeEvent, ReactElement, SelectHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MapFloorPicker } from "./MapFloorPicker";

const defaults = { floors: [1, 2], value: 2, manualValue: null, uncertain: false };

describe("MapFloorPicker", () => {
  it("shows the automatic floor without marking a manual choice", () => {
    const markup = renderToStaticMarkup(<MapFloorPicker {...defaults} onChange={vi.fn()} />);
    expect(markup).toContain('aria-label="Map floor"');
    expect(markup).toContain('<option value="auto" selected="">Auto (Floor 2)</option>');
  });

  it("keeps every published floor and Auto selectable when artwork is unavailable", () => {
    const markup = renderToStaticMarkup(<MapFloorPicker {...defaults} manualValue={2} onChange={vi.fn()} />);
    expect(markup).toContain('<option value="auto">Auto</option>');
    expect(markup).toContain('<option value="1">Floor 1 (manual)</option>');
    expect(markup).toContain('<option value="2" selected="">Floor 2 (manual)</option>');
  });

  it("makes uncertainty visible and accessible, even with a single published floor", () => {
    const markup = renderToStaticMarkup(<MapFloorPicker {...defaults} floors={[1]} uncertain onChange={vi.fn()} />);
    expect(markup).toContain('<span>Floor uncertain · choose a floor</span>');
    expect(markup).toContain('aria-label="Map floor: Floor uncertain · choose a floor"');
    expect(markup).toContain('value="auto"');
    expect(markup).toContain('value="1"');
  });

  it("does not add a redundant picker for a certain single-floor instance", () => {
    expect(renderToStaticMarkup(<MapFloorPicker {...defaults} floors={[1]} onChange={vi.fn()} />)).toBe("");
  });

  it("sends manual floors as numbers and Auto as null without local state", () => {
    const onChange = vi.fn();
    const picker = MapFloorPicker({ ...defaults, onChange });
    const select = picker!.props.children[1] as ReactElement<SelectHTMLAttributes<HTMLSelectElement>>;
    select.props.onChange!({ target: { value: "1" } } as ChangeEvent<HTMLSelectElement>);
    select.props.onChange!({ target: { value: "auto" } } as ChangeEvent<HTMLSelectElement>);
    expect(onChange.mock.calls).toEqual([[1], [null]]);
    expect(select.props.value).toBe("auto");
  });
});
