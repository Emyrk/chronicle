import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { RecentInstance } from "@/api/typesGenerated";
import { RaidCard } from "./RaidCard";

function recentInstance(id: string, uploaderName: string): RecentInstance {
  return {
    id,
    slug: id,
    name: "Molten Core",
    realm_id: "realm",
    realm_name: "Ambershire",
    uploader_id: `uploader-${id}`,
    uploader_name: uploaderName,
    uploaded_at: "2026-09-12T00:00:00Z",
    first_encounter_time: "2026-09-11T20:00:00Z",
    player_count: 40,
    boss_count: 10,
    boss_kills: 10,
    duration_ms: 3600000,
    has_youtube_video: false,
    recorder_name: uploaderName,
    difficulty_name: "",
    max_players: 40,
    dynamic_difficulty: 0,
  };
}

describe("RaidCard grouped uploads", () => {
  it("renders only the compact count and numbered upload controls", () => {
    const instances = [
      recentInstance("canonical", "Emyrk"),
      recentInstance("second", "Steven"),
      recentInstance("third", "Mira"),
    ];

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <RaidCard instance={instances[0]} instances={instances} />
      </MemoryRouter>,
    );

    expect(markup).toContain('aria-label="3 uploads"');
    expect(markup).toContain('aria-label="Upload 1 from Emyrk"');
    expect(markup).toContain('aria-label="Upload 2 from Steven"');
    expect(markup).toContain('aria-label="Upload 3 from Mira"');
    expect(markup).not.toContain("duplicate");
  });

  it("does not render upload controls for a single record", () => {
    const instance = recentInstance("solo", "Emyrk");
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <RaidCard instance={instance} />
      </MemoryRouter>,
    );

    expect(markup).not.toContain('aria-label="Uploads"');
    expect(markup).not.toContain('aria-label="1 uploads"');
  });
});
