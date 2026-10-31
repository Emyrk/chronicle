import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RootCommunityBanner,
  RootCommunityNavButton,
  RootCommunityProvider,
} from "./RootCommunityContext";

const mocks = vi.hoisted(() => ({
  siteConfig: undefined as
    | {
        root_domain_discovery: boolean;
        choose_url?: string;
        tenant: object | null;
      }
    | undefined,
}));

vi.mock("@/api/queries", () => ({
  useSiteConfig: () => ({ data: mocks.siteConfig }),
  useDiscoverableServers: () => ({
    data: [
      {
        url: "https://turtle.chronicleclassic.com",
        branding: { display_name: "Turtle WoW", tagline: "Vanilla, expanded" },
        unique_players_14d: 18_400,
      },
    ],
    isLoading: false,
  }),
}));

afterEach(() => {
  mocks.siteConfig = undefined;
});

function render(initialDismissed = false) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/instances/42?view=damage#players"]}>
      <RootCommunityProvider initialDismissed={initialDismissed}>
        <RootCommunityBanner />
        <RootCommunityNavButton />
      </RootCommunityProvider>
    </MemoryRouter>,
  );
}

describe("RootCommunityContext", () => {
  it("renders the root context while leaving the page usable", () => {
    mocks.siteConfig = {
      root_domain_discovery: true,
      choose_url: "https://choose.chronicleclassic.com",
      tenant: null,
    };

    const markup = render();

    expect(markup).toContain("You’re viewing Chronicle across every community");
    expect(markup).toContain("Pick where you play for its logs, rankings, and game data.");
    expect(markup).toContain('aria-label="Browse communities"');
    expect(markup).not.toContain("href=");
  });

  it("shows the compact chooser action after dismissal", () => {
    mocks.siteConfig = {
      root_domain_discovery: true,
      choose_url: "https://choose.chronicleclassic.com",
      tenant: null,
    };

    const markup = render(true);

    expect(markup).not.toContain("You’re viewing Chronicle across every community");
    expect(markup).toContain("Choose community");
  });

  it("does not render on a community tenant", () => {
    mocks.siteConfig = {
      root_domain_discovery: true,
      choose_url: "https://choose.chronicleclassic.com",
      tenant: {},
    };

    expect(render()).toBe("");
  });

  it("does not render when root discovery is disabled", () => {
    mocks.siteConfig = {
      root_domain_discovery: false,
      choose_url: "https://choose.chronicleclassic.com",
      tenant: null,
    };

    expect(render()).toBe("");
  });
});
