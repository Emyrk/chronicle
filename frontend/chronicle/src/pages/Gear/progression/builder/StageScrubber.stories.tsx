import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StageScrubber, type StageStop } from "./StageScrubber";

const meta: Meta<typeof StageScrubber> = {
  title: "Gear/Progression/StageScrubber",
  component: StageScrubber,
};

export default meta;
type Story = StoryObj<typeof StageScrubber>;

const STOPS: StageStop[] = [
  { stage: { name: "Fresh 80", slots: {} }, averageItemLevel: 164.2, filledSlots: 15 },
  { stage: { name: "Pre-Raid", slots: {} }, averageItemLevel: 194.8, filledSlots: 17 },
  { stage: { name: "Naxx", slots: {} }, averageItemLevel: 213.1, filledSlots: 17 },
];

function Interactive({ stops }: { stops: StageStop[] }) {
  const [index, setIndex] = useState(1);
  return (
    <div className="max-w-3xl bg-zinc-950 p-6">
      <StageScrubber
        stops={stops}
        stageIndex={index}
        onSelect={setIndex}
        onAdd={() => undefined}
        onRename={() => undefined}
        onRemove={() => undefined}
        onMove={() => undefined}
      />
    </div>
  );
}

export const Editable: Story = {
  render: () => <Interactive stops={STOPS} />,
};

export const ReadOnly: Story = {
  render: () => (
    <div className="max-w-3xl bg-zinc-950 p-6">
      <StageScrubber stops={STOPS} stageIndex={2} onSelect={() => undefined} />
    </div>
  ),
};

export const NoStages: Story = {
  render: () => (
    <div className="max-w-3xl bg-zinc-950 p-6">
      <StageScrubber
        stops={[]}
        stageIndex={0}
        onSelect={() => undefined}
        onAdd={() => undefined}
      />
    </div>
  ),
};
