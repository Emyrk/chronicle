import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MemoryRouter } from "react-router-dom";
import { AIKeyBannerView } from "./AIKeyBanner";

const meta: Meta<typeof AIKeyBannerView> = {
  title: "Features/AI key/Banner",
  component: AIKeyBannerView,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  args: { onDismiss: fn() },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof AIKeyBannerView>;

/** The owner opened their own AI link in this browser. */
export const Owner: Story = { args: { kind: "owner" } };

/** Someone else's key, or the owner's from another device. */
export const Other: Story = { args: { kind: "other" } };
