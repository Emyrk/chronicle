import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RecentInstance, RecentInstancesResponse } from "@/api/typesGenerated";
import { LatestUploads } from "./Home";

const NO_UPLOADS = "No uploads yet";

const instance: RecentInstance = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "molten-core-test",
  name: "Molten Core",
  realm_id: "realm",
  realm_name: "Realm",
  uploader_id: "uploader",
  uploader_name: "Uploader",
  uploaded_at: "2026-01-01T00:00:00Z",
  first_encounter_time: "2026-01-01T00:00:00Z",
  player_count: 40,
  boss_count: 10,
  boss_kills: 10,
  duration_ms: 3_600_000,
  has_youtube_video: false,
  recorder_name: "Recorder",
  difficulty_name: "",
  max_players: 40,
  dynamic_difficulty: 0,
};

function render(recent?: RecentInstancesResponse) {
  const client = new QueryClient();
  if (recent) client.setQueryData(["home", "recent-uploads"], recent);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LatestUploads />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LatestUploads", () => {
  it("makes no claim before the API has answered (prerender and first paint)", () => {
    const markup = render();
    expect(markup).toContain("Recent logs");
    expect(markup).not.toContain(NO_UPLOADS);
  });

  it("shows the logs and no empty claim when the tenant has logs", () => {
    const markup = render({ instances: [instance], has_more: false });
    expect(markup).toContain("Molten Core");
    expect(markup).not.toContain(NO_UPLOADS);
  });

  it("says there are no uploads only when the API returned none", () => {
    const markup = render({ instances: [], has_more: false });
    expect(markup).toContain(NO_UPLOADS);
  });
});
