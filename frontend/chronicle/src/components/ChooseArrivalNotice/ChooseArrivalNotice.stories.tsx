import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { SiteConfig } from "@/api/typesGenerated";
import { ChooseArrivalNotice } from "./ChooseArrivalNotice";

const siteConfig = {
  signups_enabled: true,
  client_uploads_disabled: false,
  billing_enabled: false,
  ads_enabled: false,
  disabled_ads: [],
  discoverable: true,
  root_domain_discovery: false,
  default_format: null,
  available_formats: [],
  dataset_flavor: [],
  primary_domain: "chronicleclassic.com",
  access_url: "https://legacy.chronicleclassic.com",
  choose_url: "https://choose.chronicleclassic.com",
  branding: null,
  tenant: {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "chromie",
    name: "chromie",
    disable_client_upload: false,
    include_in_all: true,
    discoverable: true,
    ads_enabled: false,
    disabled_ads: [],
    branding: {
      display_name: "Chromie Craft",
      square_logo: "https://icons.chronicleclassic.com/servers/chromiecraft/chromie-square.webp",
    },
    parse_config: null,
    default_dataset_id: null,
    default_format: null,
    available_formats: [],
    additional_flavor: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
} satisfies SiteConfig;

const meta = {
  title: "Chooser/ArrivalNotice",
  component: ChooseArrivalNotice,
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={[context.parameters.route ?? "/instances/42?from_choose=saved"]}>
        <div className="min-h-screen bg-background">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [http.get("/api/v1/site-config", () => HttpResponse.json(siteConfig))],
    },
  },
} satisfies Meta<typeof ChooseArrivalNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Auto-redirected by a saved choice. */
export const Saved: Story = {};

/** Picked just now with "Remember my choice" on. */
export const Remembered: Story = {
  parameters: { route: "/instances/42?from_choose=remembered" },
};

/** Picked just now without saving. */
export const Picked: Story = {
  parameters: { route: "/instances/42?from_choose=picked" },
};

/** Arrived on the main site, which has no tenant branding. */
export const MainSite: Story = {
  parameters: {
    msw: {
      handlers: [http.get("/api/v1/site-config", () => HttpResponse.json({ ...siteConfig, tenant: null }))],
    },
  },
};
