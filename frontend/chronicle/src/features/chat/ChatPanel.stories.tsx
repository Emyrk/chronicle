import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "./ChatPanel";
import type { AssistantChatController } from "./useAssistantChat";

function controller(overrides: Partial<AssistantChatController> = {}): AssistantChatController {
  return {
    messages: [],
    status: "idle",
    isRunning: false,
    submit: async () => true,
    cancel: () => undefined,
    clearError: () => undefined,
    ...overrides,
  };
}

const meta = {
  title: "Features/Chat/ChatPanel",
  component: ChatPanel,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="h-[680px] w-[420px] overflow-hidden rounded-xl border shadow-xl">
        <Story />
      </div>
    ),
  ],
  args: {
    controller: controller(),
  },
} satisfies Meta<typeof ChatPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const StreamingWithTool: Story = {
  args: {
    controller: controller({
      status: "running",
      isRunning: true,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Which ability caused the most avoidable damage?",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "I’m checking the selected encounters and comparing incoming damage by ability.",
          streaming: true,
          toolCalls: [
            {
              id: "tool-1",
              name: "inspect_encounter_damage",
              arguments: '{"encounterIds":["e-1","e-2"],"avoidableOnly":true}',
              status: "streaming",
            },
          ],
        },
      ],
    }),
  },
};

export const Error: Story = {
  args: {
    controller: controller({
      status: "error",
      error: "The provider disconnected before the response was complete.",
      messages: [
        { id: "user-1", role: "user", content: "Summarize this raid." },
      ],
    }),
  },
};

export const ConnectRequired: Story = {
  args: {
    disabled: true,
    disabledTitle: "Connect an AI provider",
    disabledDescription: "Choose and authorize a provider in settings before using raid assistance.",
    disabledAction: <Button size="sm">Open settings</Button>,
  },
};
