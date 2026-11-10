import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RawLogCleanupSummary } from "./RawLogCleanupSummary";

function render(ids?: string[]) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RawLogCleanupSummary cleanup={ids ? { deleted_log_ids: ids } : undefined} />
    </MemoryRouter>,
  );
}

describe("RawLogCleanupSummary", () => {
  it("hides absent and empty cleanup", () => {
    expect(render()).toBe("");
    expect(render([])).toBe("");
  });

  it("explains cleanup and preserves report links", () => {
    const markup = render(["old-log"]);
    expect(markup).toContain("raw files, parts, and artifacts from 1 older log.");
    expect(markup).toContain("Parsed reports are preserved.");
    expect(markup).toContain('href="/logs/old-log"');
    expect(markup).not.toContain("more</li>");
  });

  it("bounds links to five and counts the remainder", () => {
    const markup = render(Array.from({ length: 7 }, (_, i) => `log-${i}`));
    expect(markup.match(/<a /g)).toHaveLength(5);
    expect(markup).toContain('href="/logs/log-4"');
    expect(markup).not.toContain('href="/logs/log-5"');
    expect(markup).toContain("and 2 more");
  });
});
