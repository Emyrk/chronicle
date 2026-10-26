import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DownloadPage } from "./Download";

function render(entry: string) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <DownloadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function downloadLinks(html: string) {
  return [...html.matchAll(/href="([^"]*\/api\/v1\/sidekick-release\/download\/[^"]*)"/g)].map((m) =>
    m[1].replaceAll("&amp;", "&"),
  );
}

describe("DownloadPage", () => {
  it("carries the campaign's utm params on every download link", () => {
    const links = downloadLinks(render("/download?utm_source=x&utm_content=A&os=windows"));
    expect(links.map((l) => l.split("?")[0])).toEqual([
      "/api/v1/sidekick-release/download/windows",
      "/api/v1/sidekick-release/download/macos",
      "/api/v1/sidekick-release/download/linux",
    ]);
    for (const link of links) {
      const params = new URL(link, "http://x").searchParams;
      expect(params.get("utm_source")).toBe("x");
      expect(params.get("utm_content")).toBe("A");
    }
  });

  it("explains pairing as the account step", () => {
    expect(render("/download?utm_source=x&os=macos")).toContain("approve in the browser, that is your account");
  });
});
