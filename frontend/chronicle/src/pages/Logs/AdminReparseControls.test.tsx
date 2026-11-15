import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminReparseControls } from "./AdminReparseControls";

function render(hasAdminLogs?: boolean, canReparse = true) {
  return renderToStaticMarkup(
    <AdminReparseControls hasAdminLogs={hasAdminLogs} canReparse={canReparse} parserEngine="legacy" onParserEngineChange={() => {}} disabled={false}>
      <button>Reparse (Verbose)</button>
      <button>Reparse (CPU Profile)</button>
    </AdminReparseControls>,
  );
}

describe("AdminReparseControls", () => {
  it.each([false, undefined])("hides the entire diagnostic section for admin permission %s despite reparse permission", (hasAdminLogs) => {
    expect(render(hasAdminLogs)).toBe("");
  });

  it("does not allow admin tools without log reparse permission", () => {
    expect(render(true, false)).toBe("");
  });

  it("shows effective administrators the independent legacy-default selector and diagnostic actions", () => {
    const markup = render(true);
    expect(markup).toContain('aria-label="Admin parser tools"');
    expect(markup).toContain('<option value="legacy" selected="">');
    expect(markup).toContain("Reparse (Verbose)");
    expect(markup).toContain("Reparse (CPU Profile)");
  });

  it("keeps controls content-sized and adjacent, with wrapping instead of distributed columns", () => {
    const markup = render(true);
    expect(markup).toMatch(/^<section[^>]*w-fit max-w-full min-w-0/);
    expect(markup).toContain("flex min-w-0 flex-wrap items-end gap-2");
    expect(markup).not.toContain("grid-cols");
    expect(markup).toContain("w-56 max-w-full");
    expect(markup).toContain("flex w-fit max-w-full flex-wrap");
  });

  it("keeps explanatory text collapsed and outside the action row", () => {
    const markup = render(true);
    const details = markup.slice(markup.indexOf("<details"));
    expect(details).toContain("About verbose parsing");
    expect(details).toContain("only verbose parsernext saves a snapshot");
    expect(details).not.toMatch(/<details[^>]* open/);
    expect(markup.slice(0, markup.indexOf("<details"))).not.toContain("Engine selection applies");
    expect(markup).not.toContain('id="parser-engine-description"');
  });
});
