import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MemoryRouter } from "react-router-dom";
import { AIKeyWarningDialog } from "./AIKeyWarningDialog";
import { AI_KEY_TIERS, activeAIKey } from "./aiKey.fixtures";

const meta: Meta<typeof AIKeyWarningDialog> = {
  title: "Features/AI key/Warning modal",
  component: AIKeyWarningDialog,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  args: { open: true, onOpenChange: fn(), onConfirm: fn(), defaultLifetimeHours: null, benefits: AI_KEY_TIERS[0] },
};

export default meta;
type Story = StoryObj<typeof AIKeyWarningDialog>;

/** First key at the free tier: 1h or 24h. */
export const FreeTier: Story = {};

export const ExaltedTier: Story = { args: { benefits: AI_KEY_TIERS[3], defaultLifetimeHours: 720 } };

/** The picked AI changes the confirm button. */
export const OpenInClaude: Story = { args: { actionLabel: "Open in Claude" } };

/** A key already exists (made in Settings or on another device): its expiry applies. */
export const ExistingKey: Story = { args: { existingKey: activeAIKey } };

export const LoadingTier: Story = { args: { benefits: undefined } };

export const Busy: Story = { args: { busy: true } };
