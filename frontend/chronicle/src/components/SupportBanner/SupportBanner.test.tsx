import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportBanner } from "./SupportBanner";

const OLD_ACCOUNT = "2020-01-01T00:00:00Z";

const mocks = vi.hoisted(() => ({
  session: undefined as { created_at: string; ads_free: boolean } | undefined,
  siteConfig: undefined as { ads_enabled: boolean; billing_enabled: boolean } | undefined,
  supporter: false,
}));

vi.mock("@/api/queries", () => ({
  useSession: () => ({ data: mocks.session, isLoading: false }),
  useSiteConfig: () => ({ data: mocks.siteConfig, isLoading: false }),
  useAuthorizationCheck: () => ({ data: { supporter: mocks.supporter }, isLoading: false }),
}));

vi.mock("./supportBannerStorage", () => ({
  migrateSupportBannerHideUntil: () => {},
  readSupportBannerHideUntil: () => 0,
  writeSupportBannerHideUntil: () => {},
}));

afterEach(() => {
  mocks.session = undefined;
  mocks.siteConfig = undefined;
  mocks.supporter = false;
});

function render() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <SupportBanner />
    </MemoryRouter>,
  );
}

describe("SupportBanner", () => {
  it("asks to go ad-free when the deployment serves ads and has billing", () => {
    mocks.session = { created_at: OLD_ACCOUNT, ads_free: false };
    mocks.siteConfig = { ads_enabled: true, billing_enabled: true };

    const markup = render();

    expect(markup).toContain("Go Ad-Free");
    expect(markup).toContain('href="/account/billing"');
    expect(markup).not.toContain("chronicleclassic.com/support");
  });

  it("asks for donations when ads are disabled", () => {
    mocks.session = { created_at: OLD_ACCOUNT, ads_free: false };
    mocks.siteConfig = { ads_enabled: false, billing_enabled: true };

    const markup = render();

    expect(markup).toContain("Community support helps keep Chronicle running.");
    expect(markup).toContain('href="https://chronicleclassic.com/support/"');
    expect(markup).not.toContain("Go Ad-Free");
  });

  it("thanks ad-free subscribers", () => {
    mocks.session = { created_at: OLD_ACCOUNT, ads_free: true };
    mocks.siteConfig = { ads_enabled: true, billing_enabled: true };

    const markup = render();

    expect(markup).toContain("Thank you for supporting Chronicle.");
    expect(markup).not.toContain("Go Ad-Free");
  });

  it("thanks holders of the supporter role", () => {
    mocks.session = { created_at: OLD_ACCOUNT, ads_free: false };
    mocks.siteConfig = { ads_enabled: true, billing_enabled: true };
    mocks.supporter = true;

    expect(render()).toContain("Thank you for supporting Chronicle.");
  });
});
