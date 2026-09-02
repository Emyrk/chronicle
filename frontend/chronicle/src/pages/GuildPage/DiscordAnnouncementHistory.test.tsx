import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DiscordAnnouncementHistoryList } from "./DiscordAnnouncementHistory";

describe("DiscordAnnouncementHistoryList", () => {
  it("renders delivery errors, channel names, log links, and pagination", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <DiscordAnnouncementHistoryList
          attempts={[
            {
              id: "attempt-1",
              run_id: "run-1",
              discord_channel_id: "channel-1",
              delivery_attempted_at: "2026-09-02T12:00:00Z",
              delivery_error: "HTTP 403 Forbidden: Missing Permissions (50013)",
              instance_slug: "molten-core-run",
              status: "failed",
              created_at: "2026-09-02T11:59:00Z",
              updated_at: "2026-09-02T12:00:00Z",
            },
          ]}
          channels={[{ id: "channel-1", name: "raid-logs" }]}
          page={1}
          hasMore
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Failed");
    expect(markup).toContain("#raid-logs");
    expect(markup).toContain("Missing Permissions (50013)");
    expect(markup).toContain('href="/instances/molten-core-run"');
    expect(markup).toContain("Previous");
    expect(markup).toContain("Next");
    expect(markup).toContain("Page 2");
  });

  it("renders an empty state without pagination", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <DiscordAnnouncementHistoryList
          attempts={[]}
          channels={[]}
          page={0}
          hasMore={false}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("No announcements have been attempted yet.");
    expect(markup).not.toContain("Previous");
  });
});
