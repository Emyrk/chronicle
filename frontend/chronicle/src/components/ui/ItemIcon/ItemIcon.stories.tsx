import type { Meta, StoryObj } from "@storybook/react-vite";
import { ItemIcon } from "./ItemIcon";

const meta: Meta<typeof ItemIcon> = {
  title: "UI/ItemIcon",
  component: ItemIcon,
};

export default meta;
type Story = StoryObj<typeof ItemIcon>;

export const Qualities: Story = {
  render: () => (
    <div className="flex items-center gap-2 p-4 bg-zinc-950">
      {[0, 1, 2, 3, 4, 5].map((q) => (
        <ItemIcon key={q} icon="inv_helmet_21" quality={q} size={40} />
      ))}
    </div>
  ),
};

export const Placeholder: Story = {
  render: () => (
    <div className="flex items-center gap-2 p-4 bg-zinc-950">
      <ItemIcon quality={3} size={40} />
      <ItemIcon quality={4} size={24} />
    </div>
  ),
};
