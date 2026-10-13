import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TenantBanner } from "./TenantGate";

/**
 * Info banner shown when the primary domain views a tenanted instance
 * that has include_in_all=true. The page content is shown normally
 * underneath this banner.
 *
 * Truth table row: currentSlug=null, instanceSlug="A", include_in_all=true
 */
const meta = {
  title: "Instance/TenantGate/TenantBanner",
  component: TenantBanner,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="max-w-2xl mx-auto">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TenantBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Primary domain viewing an include_in_all tenant instance — with link.
 */
export const WithLink: Story = {
  args: {
    serverLabel: "Turtle WoW",
    realmName: "Nordanaar",
    logoUrl: null, // placeholder — no tenant logo yet
    targetUrl: "https://legacy.chronicleclassic.com/instances/abc-123",
  },
};

/**
 * With a tenant logo available.
 */
export const WithLogo: Story = {
  args: {
    serverLabel: "Chronicle",
    realmName: "Ambershire",
    logoUrl: "/c/chronicle/ChronicleIconSquare.png",
    targetUrl: "https://chronicleclassic.com/instances/abc-123",
  },
};

/**
 * Primary domain viewing an include_in_all tenant instance — no link
 * (primary domain not configured).
 */
export const WithoutLink: Story = {
  args: {
    serverLabel: "Epoch",
    realmName: "Ambershire",
    logoUrl: null,
    targetUrl: null,
  },
};

/**
 * No realm name available — only shows the tenant/server name.
 */
export const NoRealmName: Story = {
  args: {
    serverLabel: "Turtle WoW",
    logoUrl: null,
    targetUrl: "https://legacy.chronicleclassic.com/instances/abc-123",
  },
};
