import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ForeverAnnouncementBanner } from "./ForeverAnnouncementBanner";

vi.mock("@/api/queries", () => ({
  useSiteConfig: () => ({
    data: { tenant: { slug: "turtle-wow" } },
  }),
}));

describe("ForeverAnnouncementBanner", () => {
  it("uses the tenant slug as the tracking source", () => {
    const markup = renderToStaticMarkup(
      <ForeverAnnouncementBanner flavor={["vanilla", "turtle"]} />,
    );

    expect(markup).toContain("Now supporting WoW Forever");
    expect(markup).toContain(
      'href="https://forever.chronicleclassic.com/?chr_src=turtle-wow&amp;chr_pos=announcement_banner&amp;chr_cmp=wow_forever_launch"',
    );
    expect(markup).toContain('src="https://icons.chronicleclassic.com/servers/forever/logo_wide.webp"');
  });

  it("does not show on the WoW Forever deployment", () => {
    expect(
      renderToStaticMarkup(
        <ForeverAnnouncementBanner flavor={["vanilla", "wow-forever"]} />,
      ),
    ).toBe("");
  });
});
