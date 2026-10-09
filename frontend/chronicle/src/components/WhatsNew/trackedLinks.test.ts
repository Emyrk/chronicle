import { describe, expect, it } from "vitest";
import { whatsNewLink } from "./trackedLinks";

describe("whatsNewLink", () => {
  it("tags the primary announcement link", () => {
    expect(whatsNewLink("/blog/custom-panels", "whats_new_primary", "custom-panels", "turtle")).toBe(
      "/blog/custom-panels?chr_src=turtle&chr_pos=whats_new_primary&chr_cmp=custom_panels",
    );
  });

  it("tags the archive link", () => {
    expect(whatsNewLink("/blog", "whats_new_archive", "custom-panels", "epoch")).toBe(
      "/blog?chr_src=epoch&chr_pos=whats_new_archive&chr_cmp=custom_panels",
    );
  });
});
