import type { Meta, StoryObj } from "@storybook/react-vite";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { PartialInvalidBadge } from "./PartialInvalidBadge";

const meta = {
  title: "Instance/PartialInvalidBadge",
  component: PartialInvalidBadge,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="flex min-h-48 items-center justify-center bg-zinc-950 p-8 text-zinc-100">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    encounters: [
      {
        id: "viscidus",
        name: "Viscidus",
        invalidReason: "The kill was credited after the combat log stopped recording.",
      },
    ],
  },
} satisfies Meta<typeof PartialInvalidBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OneEncounter: Story = {};

export const MultipleEncounters: Story = {
  args: {
    encounters: [
      {
        id: "viscidus",
        name: "Viscidus",
        invalidReason: "The kill was credited after the combat log stopped recording.",
      },
      {
        id: "cthun",
        name: "C'Thun",
        invalidReason: "The encounter contains duplicate damage events.",
      },
      {
        id: "ouro",
        name: "Ouro",
      },
    ],
  },
};
