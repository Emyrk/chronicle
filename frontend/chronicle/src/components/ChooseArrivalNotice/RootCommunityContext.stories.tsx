import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { DiscoveryEntry, SiteConfig } from "@/api/typesGenerated";
import {
  RootCommunityBanner,
  RootCommunityDialog,
  RootCommunityNavButton,
  RootCommunityProvider,
} from "@/components/RootCommunityContext/RootCommunityContext";

const siteConfig = {
  signups_enabled: true,
  client_uploads_disabled: false,
  billing_enabled: false,
  ads_enabled: false,
  disabled_ads: [],
  discoverable: true,
  root_domain_discovery: true,
  default_format: null,
  available_formats: [],
  dataset_flavor: [],
  primary_domain: "chronicleclassic.com",
  access_url: "https://legacy.chronicleclassic.com",
  choose_url: "https://choose.chronicleclassic.com",
  branding: null,
  tenant: null,
} satisfies SiteConfig;

const communities = [
  {
    url: "https://turtle.chronicleclassic.com",
    branding: {
      display_name: "Turtle WoW",
      tagline: "Vanilla, expanded",
    },
    unique_players_14d: 18_400,
  },
  {
    url: "https://chromie.chronicleclassic.com",
    branding: {
      display_name: "ChromieCraft",
      tagline: "Progressive Wrath powered by AzerothCore",
      square_logo: "https://icons.chronicleclassic.com/servers/chromiecraft/chromie-square.webp",
    },
    unique_players_14d: 6_200,
  },
  {
    url: "https://epoch.chronicleclassic.com",
    branding: {
      display_name: "Epoch",
      tagline: "A new journey through Azeroth",
    },
    unique_players_14d: 3_800,
  },
  {
    url: "https://kronos.chronicleclassic.com",
    branding: {
      display_name: "Kronos",
      tagline: "Classic progression and community",
    },
    unique_players_14d: 1_100,
  },
] satisfies DiscoveryEntry[];

type RootContextPreviewProps = {
  initialDismissed?: boolean;
  initialDialogOpen?: boolean;
};

function RootContextPreview({ initialDismissed, initialDialogOpen }: RootContextPreviewProps) {
  return (
    <MemoryRouter initialEntries={["/instances/42?view=damage#players"]}>
      <RootCommunityProvider initialDismissed={initialDismissed} initialDialogOpen={initialDialogOpen}>
        <div className="min-h-screen bg-background text-foreground">
          <nav className="flex h-16 items-center border-b bg-background/95 px-4 backdrop-blur md:px-6">
            <img src="/c/chronicle/ChronicleLogoCenter.svg" alt="Chronicle" className="h-11 w-auto" />
            <div className="ml-auto">
              <RootCommunityNavButton />
            </div>
          </nav>
          <RootCommunityBanner />
          <main>
            <section className="relative overflow-hidden border-b px-5 py-16 md:py-24">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_38%)]" />
              <div className="relative mx-auto max-w-6xl">
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-(--tertiary)">Combat logs, made readable</p>
                <h1 className="mt-4 max-w-3xl font-wow text-4xl leading-tight md:text-6xl">Every raid tells a story.</h1>
                <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                  The root site remains fully usable while the context UI helps visitors find their community.
                </p>
              </div>
            </section>
          </main>
          <RootCommunityDialog />
        </div>
      </RootCommunityProvider>
    </MemoryRouter>
  );
}

const meta = {
  title: "Chooser/Root Context",
  component: RootContextPreview,
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.get("/api/v1/site-config", () => HttpResponse.json(siteConfig)),
        http.get("/api/v1/discovery", () => HttpResponse.json(communities)),
      ],
    },
  },
} satisfies Meta<typeof RootContextPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Root home with the production explanatory context bar. */
export const Home: Story = {};

/** The production selector opens without replacing the current page. */
export const SelectorOpen: Story = {
  args: { initialDialogOpen: true },
};

/** After dismissal, the compact navigation action remains for the session. */
export const Dismissed: Story = {
  args: { initialDismissed: true },
};

/** Narrow-screen treatment for the root context and community selector. */
export const MobileSelector: Story = {
  args: { initialDialogOpen: true },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
};
