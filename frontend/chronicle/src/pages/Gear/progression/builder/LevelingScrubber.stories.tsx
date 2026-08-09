import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LevelingScrubber } from "./LevelingScrubber";

const meta: Meta<typeof LevelingScrubber> = {
  title: "Gear/Progression/LevelingScrubber",
  component: LevelingScrubber,
};

export default meta;
type Story = StoryObj<typeof LevelingScrubber>;

const UPGRADES = [1, 8, 14, 20, 25, 31, 37, 42, 48, 52, 56, 58, 60];

function Interactive({
  start,
  maxLevel,
  upgrades,
}: {
  start: number;
  maxLevel: number;
  upgrades?: number[];
}) {
  const [level, setLevel] = useState(start);
  return (
    <div className="max-w-3xl bg-zinc-950 p-6">
      <LevelingScrubber
        level={level}
        minLevel={1}
        maxLevel={maxLevel}
        onChange={setLevel}
        upgradeLevels={upgrades}
      />
    </div>
  );
}

export const Vanilla: Story = {
  render: () => <Interactive start={34} maxLevel={60} upgrades={UPGRADES} />,
};

/** The cap is reachable — the derived set and the stages coexist there. */
export const AtCap: Story = {
  render: () => <Interactive start={60} maxLevel={60} upgrades={UPGRADES} />,
};

export const EmptyPool: Story = {
  render: () => <Interactive start={1} maxLevel={60} />,
};

export const Wrath: Story = {
  render: () => (
    <Interactive start={72} maxLevel={80} upgrades={[1, 20, 40, 58, 60, 68, 70, 72, 76, 80]} />
  ),
};
