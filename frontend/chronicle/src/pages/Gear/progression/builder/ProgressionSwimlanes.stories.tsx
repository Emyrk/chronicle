import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressionSwimlanes } from "./ProgressionSwimlanes";
import { SLOT, type ProgressionColumn } from "../progressionModel";
import { itemRefKey, type HydratedItem } from "@/pages/Gear/builder/useListItems";

const meta: Meta<typeof ProgressionSwimlanes> = {
  title: "Gear/Progression/ProgressionSwimlanes",
  component: ProgressionSwimlanes,
};

export default meta;
type Story = StoryObj<typeof ProgressionSwimlanes>;

function hydrated(
  itemId: number,
  name: string,
  icon: string,
  quality: number,
  itemLevel: number,
): [string, HydratedItem] {
  return [itemRefKey(itemId), { itemId, name, icon, quality, itemLevel, isLoading: false }];
}

const ITEMS = new Map<string, HydratedItem>([
  hydrated(1, "Ravager's Cap", "inv_helmet_21", 2, 22),
  hydrated(2, "Lionheart Helm", "inv_helmet_21", 4, 63),
  hydrated(3, "Silver-Linked Chestguard", "inv_chest_chain_05", 2, 24),
  hydrated(4, "Breastplate of Might", "inv_chest_plate03", 4, 66),
  hydrated(5, "Rusty Bastard Sword", "inv_sword_04", 1, 18),
  hydrated(6, "Perdition's Blade", "inv_sword_48", 4, 76),
]);

const COLUMNS: ProgressionColumn[] = [
  { level: 1, equipped: {} },
  { level: 18, equipped: { [SLOT.mainHand]: 5 } },
  { level: 22, equipped: { [SLOT.head]: 1, [SLOT.mainHand]: 5 } },
  { level: 24, equipped: { [SLOT.head]: 1, [SLOT.chest]: 3, [SLOT.mainHand]: 5 } },
  { level: 60, equipped: { [SLOT.head]: 2, [SLOT.chest]: 4, [SLOT.mainHand]: 6 } },
];

export const Vanilla: Story = {
  render: () => (
    <div className="bg-zinc-950 p-6">
      <ProgressionSwimlanes columns={COLUMNS} items={ITEMS} currentLevel={24} />
    </div>
  ),
};

export const EmptyPool: Story = {
  render: () => (
    <div className="bg-zinc-950 p-6">
      <ProgressionSwimlanes columns={[]} items={new Map()} />
    </div>
  ),
};
