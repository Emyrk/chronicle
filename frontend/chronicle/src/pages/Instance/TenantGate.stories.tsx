import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BlockingDialog } from "./TenantGate";

/**
 * Blocking dialog shown when a user tries to view an instance from the wrong
 * tenant context. Shows both tenant logos, explains where the log was recorded,
 * where the user currently is, and provides a link to the correct domain.
 *
 * Truth table rows that produce this dialog:
 *
 * | currentSlug | instanceSlug | include_in_all | Result                             |
 * |-------------|--------------|----------------|------------------------------------|
 * | null        | "A"          | false          | Block → link to A.domain           |
 * | "B"         | "A"          | —              | Block → link to A.domain           |
 * | "A"         | null         | —              | Block → link to primary domain     |
 * | "B"         | null         | —              | Block → link to primary domain     |
 */

const meta = {
  title: "Instance/TenantGate/BlockingDialog",
  component: BlockingDialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof BlockingDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Tenant B user views tenant A's instance.
 * Shows instance name, both tenant logos, and target domain under the button.
 */
export const CrossTenantWithLogos: Story = {
  args: {
    instanceName: "Molten Core",
    instanceTenantName: "Turtle WoW",
    instanceTenantLogo: null, // placeholder until logos exist
    realmName: "Nordanaar",
    currentTenantName: "Epoch",
    currentTenantLogo: "/c/chronicle/ChronicleIconSquare.webp",
    targetUrl: "https://legacy.chronicleclassic.com/instances/abc-123",
  },
};

/**
 * Primary domain (Chronicle) user views a non-included tenant instance.
 * Current tenant is "Chronicle" with the square icon logo.
 */
export const PrimaryBlockedNotIncluded: Story = {
  args: {
    instanceName: "Onyxia's Lair",
    instanceTenantName: "Epoch",
    instanceTenantLogo: null,
    realmName: "Ambershire",
    currentTenantName: "Chronicle",
    currentTenantLogo: "/c/chronicle/ChronicleIconSquare.webp",
    targetUrl: "https://epoch.chronicleclassic.com/instances/abc-123",
  },
};

/**
 * Tenant user views an untenanted (legacy) instance.
 * Instance belongs on the primary domain ("Chronicle").
 */
export const TenantViewingUntenanted: Story = {
  args: {
    instanceName: "Blackwing Lair",
    instanceTenantName: "Chronicle",
    instanceTenantLogo: "/c/chronicle/ChronicleIconSquare.webp",
    realmName: "Ambershire",
    currentTenantName: "Turtle WoW",
    currentTenantLogo: "/c/chronicle/ChronicleIconSquare.webp",
    targetUrl: "https://chronicleclassic.com/instances/abc-123",
  },
};

/**
 * No primary domain configured — redirect button and domain hint are hidden.
 */
export const NoTargetUrl: Story = {
  args: {
    instanceName: "Naxxramas",
    instanceTenantName: "Turtle WoW",
    instanceTenantLogo: null,
    realmName: "Nordanaar",
    currentTenantName: "Epoch",
    currentTenantLogo: "/c/chronicle/ChronicleIconSquare.webp",
    targetUrl: null,
  },
};

/**
 * Instance has no realm name — only tenant name is shown.
 */
export const NoRealmName: Story = {
  args: {
    instanceName: "Zul'Gurub",
    instanceTenantName: "Turtle WoW",
    instanceTenantLogo: null,
    currentTenantName: "Epoch",
    currentTenantLogo: "/c/chronicle/ChronicleIconSquare.webp",
    targetUrl: "https://legacy.chronicleclassic.com/instances/abc-123",
  },
};

/**
 * No instance name — falls back to "This log was recorded on..." wording.
 */
export const NoInstanceName: Story = {
  args: {
    instanceTenantName: "Turtle WoW",
    instanceTenantLogo: null,
    realmName: "Nordanaar",
    currentTenantName: "Epoch",
    currentTenantLogo: "/c/chronicle/ChronicleIconSquare.webp",
    targetUrl: "https://legacy.chronicleclassic.com/instances/abc-123",
  },
};
