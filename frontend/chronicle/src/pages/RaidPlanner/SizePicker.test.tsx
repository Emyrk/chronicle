import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SizePicker } from "./SizePicker";

describe("SizePicker", () => {
  it("renders every preview box as a group-count control", () => {
    const markup = renderToStaticMarkup(
      <SizePicker pending={2} onPendingChange={vi.fn()} onConfirm={vi.fn()} />,
    );

    expect(markup).toContain('aria-label="Set raid size to 1 group"');
    expect(markup).toContain('aria-label="Set raid size to 8 groups"');
    expect(markup.match(/aria-label="Set raid size to \d+ groups?"/g)).toHaveLength(8);
    expect(markup).toContain('aria-pressed="true"');
  });
});
