import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventTimelinePreview } from "./EventTimelinePreview";

const events = [
  { id: "damage", relativeMilli: -5_000, kind: "damage" as const },
  { id: "heal", relativeMilli: -10_000, kind: "healing" as const },
  { id: "absorb", relativeMilli: -15_000, kind: "prevented" as const },
];

describe("EventTimelinePreview", () => {
  it("renders colored event ticks and the shared cursor", () => {
    const markup = renderToStaticMarkup(
      <EventTimelinePreview
        events={events}
        windowMilli={30_000}
        cursorMilli={-12_000}
      />,
    );

    expect(markup).toContain('data-event-timeline-preview="true"');
    expect(markup).toContain('data-preview-event="damage"');
    expect(markup).toContain('data-preview-event="healing"');
    expect(markup).toContain('data-preview-event="prevented"');
    expect(markup).toContain("data-preview-cursor");
    expect(markup).toContain("top:40%");
  });

  it("omits the cursor when no shared cursor is active", () => {
    const markup = renderToStaticMarkup(
      <EventTimelinePreview events={events} windowMilli={30_000} cursorMilli={null} />,
    );

    expect(markup).not.toContain("data-preview-cursor");
  });
});
