import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RootCommunityBanner,
  RootCommunityNavButton,
  RootCommunityProvider,
  RootCommunityUploadPrompt,
} from "./RootCommunityContext";

const mocks = vi.hoisted(() => ({
  discoveryEnabled: false,
  siteConfig: undefined as
    | {
        root_domain_discovery: boolean;
        root_uploads_disabled?: boolean;
        choose_url?: string;
        tenant: object | null;
      }
    | undefined,
}));

vi.mock("@/api/queries", () => ({
  useSiteConfig: () => ({ data: mocks.siteConfig }),
  useDiscoverableServers: (enabled: boolean) => {
    mocks.discoveryEnabled = enabled;
    return {
      data: [
        {
          url: "https://turtle.chronicleclassic.com",
          branding: { display_name: "Turtle WoW", tagline: "Vanilla, expanded" },
          unique_players_14d: 18_400,
        },
      ],
      isLoading: false,
    };
  },
}));

afterEach(() => {
  mocks.discoveryEnabled = false;
  mocks.siteConfig = undefined;
});

function render(initialDismissed = false) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/instances/42?view=damage#players"]}>
      <RootCommunityProvider initialDismissed={initialDismissed}>
        <RootCommunityBanner />
        <RootCommunityNavButton />
        <RootCommunityUploadPrompt />
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

  it("keeps the chooser available when root uploads are disabled without showing the discovery banner", () => {
    mocks.siteConfig = {
      root_domain_discovery: false,
      root_uploads_disabled: true,
      choose_url: "https://choose.chronicleclassic.com",
      tenant: null,
    };

    const markup = render();

    expect(markup).not.toContain("You’re viewing Chronicle across every community");
    expect(markup).toContain("Upload your logs on a community server");
    expect(markup).toContain("Choose where you play to upload with that server’s log format and game data.");
    expect(mocks.discoveryEnabled).toBe(true);
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
