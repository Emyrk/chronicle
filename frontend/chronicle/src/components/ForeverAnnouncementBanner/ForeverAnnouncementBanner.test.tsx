import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ForeverAnnouncementBanner } from "./ForeverAnnouncementBanner";

describe("ForeverAnnouncementBanner", () => {
  it("shows on deployments without the WoW Forever flavor", () => {
    const markup = renderToStaticMarkup(
      <ForeverAnnouncementBanner flavor={["vanilla", "turtle"]} source="turtle" />,
    );

    expect(markup).toContain("Now supporting WoW Forever");
    expect(markup).toContain(
      'href="https://forever.chronicleclassic.com/?chr_src=turtle&amp;chr_pos=announcement_banner&amp;chr_cmp=wow_forever_launch"',
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
