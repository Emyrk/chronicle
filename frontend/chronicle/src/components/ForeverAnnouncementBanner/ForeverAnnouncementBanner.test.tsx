import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ForeverAnnouncementBanner } from "./ForeverAnnouncementBanner";

describe("ForeverAnnouncementBanner", () => {
  it("shows on deployments without the WoW Forever flavor", () => {
    const markup = renderToStaticMarkup(
      <ForeverAnnouncementBanner flavor={["vanilla", "turtle"]} />,
    );

    expect(markup).toContain("WoW Forever is now supported.");
    expect(markup).toContain('href="https://forever.chronicleclassic.com/"');
    expect(markup).toContain('src="/c/forever/wow-forever-hero.jpg"');
    expect(markup).toContain('src="https://icons.chronicleclassic.com/servers/forever/logo_sq.avif"');
  });

  it("does not show on the WoW Forever deployment", () => {
    expect(
      renderToStaticMarkup(
        <ForeverAnnouncementBanner flavor={["vanilla", "wow-forever"]} />,
      ),
    ).toBe("");
  });
});
