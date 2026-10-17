import { describe, expect, it } from "vitest";
import { whatsNewLink } from "./trackedLinks";

describe("whatsNewLink", () => {
  it("tags the primary announcement link", () => {
    expect(whatsNewLink("/blog/focus-mode", "whats_new_primary", "focus-mode", "turtle")).toBe(
      "/blog/focus-mode?chr_src=turtle&chr_pos=whats_new_primary&chr_cmp=focus_mode",
    );
  });

  it("tags the archive link", () => {
    expect(whatsNewLink("/blog", "whats_new_archive", "player-timeline", "epoch")).toBe(
      "/blog?chr_src=epoch&chr_pos=whats_new_archive&chr_cmp=player_timeline",
    );
  });
});
