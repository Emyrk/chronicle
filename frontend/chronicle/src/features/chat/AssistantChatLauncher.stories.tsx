import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantChatLauncher } from "./AssistantChat";

const meta = {
  title: "Features/Chat/AssistantChatLauncher",
  component: AssistantChatLauncher,
  parameters: { layout: "centered" },
  render: (args) => <AssistantChatLauncher className="rounded-full" {...args} />,
} satisfies Meta<typeof AssistantChatLauncher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Running: Story = { args: { running: true } };
export const RaidChat: Story = { args: { label: "Ask about this raid" } };
export const PoppedOut: Story = {
  render: () => <AssistantChatLauncher className="rounded-full" label="Chat popped out" variant="outline" />,
};
