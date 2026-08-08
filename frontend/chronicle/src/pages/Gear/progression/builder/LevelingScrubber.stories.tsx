import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LevelingScrubber } from "./LevelingScrubber";

const meta: Meta<typeof LevelingScrubber> = {
  title: "Gear/Progression/LevelingScrubber",
  component: LevelingScrubber,
};

export default meta;
type Story = StoryObj<typeof LevelingScrubber>;

const UPGRADES = [1, 8, 14, 20, 25, 31, 37, 42, 48, 52, 56, 58];

function Interactive({ start = 34 }: { start?: number }) {
  const [level, setLevel] = useState(start);
  return (
    <div className="max-w-2xl bg-zinc-950 p-6">
      <LevelingScrubber
        level={level}
        minLevel={1}
        maxLevel={59}
        onChange={setLevel}
        upgradeLevels={UPGRADES}
        averageItemLevel={31.4}
        filledSlots={12}
        totalSlots={17}
      />
    </div>
  );
}

export const Vanilla: Story = {
  render: () => <Interactive />,
};

export const EmptyPool: Story = {
  render: () => (
    <div className="max-w-2xl bg-zinc-950 p-6">
      <LevelingScrubber
        level={1}
        minLevel={1}
        maxLevel={59}
        onChange={() => undefined}
        averageItemLevel={null}
        filledSlots={0}
        totalSlots={17}
      />
    </div>
  ),
};

export const Wrath: Story = {
  render: () => (
    <div className="max-w-2xl bg-zinc-950 p-6">
      <LevelingScrubber
        level={72}
        minLevel={1}
        maxLevel={79}
        onChange={() => undefined}
        upgradeLevels={[1, 20, 40, 58, 60, 68, 70, 72, 76]}
        averageItemLevel={128.3}
        filledSlots={16}
        totalSlots={17}
      />
    </div>
  ),
};
