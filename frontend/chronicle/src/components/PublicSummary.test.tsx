import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicSummary } from "./PublicSummary";

function render(pathname: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[pathname]}><PublicSummary /></MemoryRouter>);
}

afterEach(() => vi.unstubAllGlobals());

describe("public page summaries", () => {
  it("shows the branded homepage with links to public reports", () => {
    vi.stubGlobal("document", { querySelector: () => ({ content: "WoW Forever" }) });
    expect(render("/")).toContain("WoW Forever combat log analysis");
    expect(render("/")).toContain('href="/leaderboards/statistics"');
  });

  it("describes the statistics page but not unrelated routes", () => {
    vi.stubGlobal("document", { querySelector: () => ({ content: "WoW Forever" }) });
    expect(render("/leaderboards/statistics")).toContain("WoW Forever raid statistics");
    expect(render("/leaderboards/statistics")).toContain('href="/leaderboards/speedruns"');
    expect(render("/recent")).toBe("");
  });
});
