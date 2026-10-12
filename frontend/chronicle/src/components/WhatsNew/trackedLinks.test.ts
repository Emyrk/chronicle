import { describe, expect, it } from "vitest";
import { whatsNewLink } from "./trackedLinks";

describe("whatsNewLink", () => {
  it("tags the primary announcement link", () => {
    expect(whatsNewLink("/blog/player-timeline", "whats_new_primary", "player-timeline", "turtle")).toBe(
      "/blog/player-timeline?chr_src=turtle&chr_pos=whats_new_primary&chr_cmp=player_timeline",
    );
  });

  it("tags the archive link", () => {
    expect(whatsNewLink("/blog", "whats_new_archive", "player-timeline", "epoch")).toBe(
      "/blog?chr_src=epoch&chr_pos=whats_new_archive&chr_cmp=player_timeline",
    );
  });
});
