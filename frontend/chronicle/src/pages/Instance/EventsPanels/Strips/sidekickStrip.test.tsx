import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { LandingFeaturedUpload } from "@/api/typesGenerated";
import type { PanelContext } from "../types";
import type { StripRenderProps } from "./types";
import { STRIPS } from "./strips";
import { formatUploadDelay, sidekickDownloadUrl, sidekickStripCopy, sidekickStripViewer } from "./sidekickStrip";

const OWNER = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";

function renderStrip(userId: string | null, upload?: LandingFeaturedUpload): string {
  const client = new QueryClient();
  client.setQueryData(["session"], userId ? { user_id: userId } : null);
  const context = { instance: { id: "inst-1", slug: "rfc-1", logOwner: OWNER, upload } } as unknown as PanelContext;
  const props = { context } as unknown as StripRenderProps<unknown>;
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>{STRIPS.sidekick.render(props)}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("sidekick strip", () => {
  it("shows the Sidekick provenance and Get yours to visitors of a Sidekick upload", () => {
    const html = renderStrip(null, { source: "sidekick", delay_ms: 3 * 60_000 + 20_000 });
    expect(html).toContain("Recorded by Sidekick, 3 min after the group left.");
    expect(html).toContain("Get yours");
    expect(html).toContain('href="/download?utm_source=run&amp;utm_content=inst-1"');
  });

  it("shows the generic line to visitors of a web, API or unknown upload", () => {
    for (const source of ["manual", "api", "unknown"] as const) {
      const html = renderStrip(null, { source, delay_ms: 60_000 });
      expect(html).toContain("Ran a dungeon this week? ");
      expect(html).toContain("Yours can be here tonight.");
      expect(html).toContain("Get Sidekick");
      expect(html).not.toContain("Recorded by Sidekick");
    }
    expect(renderStrip(null)).toContain("Get Sidekick");
  });

  it("shows Share to signed-in members and nothing to the owner", () => {
    const upload = { source: "sidekick", delay_ms: 60_000 } as const;
    const member = renderStrip(MEMBER, upload);
    expect(member).toContain("Share");
    expect(member).not.toContain("Get yours");
    expect(renderStrip(OWNER, upload)).toBe("");
  });

  it("classifies the viewer", () => {
    expect(sidekickStripViewer(undefined, OWNER)).toBe("visitor");
    expect(sidekickStripViewer(MEMBER, OWNER)).toBe("member");
    expect(sidekickStripViewer(OWNER, OWNER)).toBe("owner");
    expect(sidekickStripViewer(MEMBER, undefined)).toBe("member");
  });

  it("formats the upload delay", () => {
    expect(formatUploadDelay(0)).toBe("1 min");
    expect(formatUploadDelay(29_000)).toBe("1 min");
    expect(formatUploadDelay(3 * 60_000)).toBe("3 min");
    expect(formatUploadDelay(119 * 60_000)).toBe("119 min");
    expect(formatUploadDelay(5 * 3_600_000)).toBe("5 h");
    expect(formatUploadDelay(3 * 86_400_000)).toBe("3 days");
  });

  it("drops the delay clause when it is unknown", () => {
    expect(sidekickStripCopy({ source: "sidekick" } as LandingFeaturedUpload).text).toBe("Recorded by Sidekick.");
    expect(sidekickDownloadUrl("a b")).toBe("/download?utm_source=run&utm_content=a+b");
  });
});
