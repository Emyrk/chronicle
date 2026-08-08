import type { Meta, StoryObj } from "@storybook/react-vite";
import { DerivedSlotGrid } from "./DerivedSlotGrid";
import { SLOT } from "../progressionModel";
import { itemRefKey, type HydratedItem } from "@/pages/Gear/builder/useListItems";

const meta: Meta<typeof DerivedSlotGrid> = {
  title: "Gear/Progression/DerivedSlotGrid",
  component: DerivedSlotGrid,
};

export default meta;
type Story = StoryObj<typeof DerivedSlotGrid>;

function hydrated(
  itemId: number,
  name: string,
  icon: string,
  quality: number,
  itemLevel: number,
): [string, HydratedItem] {
  return [
    itemRefKey(itemId),
    { itemId, name, icon, quality, itemLevel, isLoading: false },
  ];
}

const ITEMS = new Map<string, HydratedItem>([
  hydrated(1, "Lionheart Helm", "inv_helmet_21", 4, 63),
  hydrated(2, "Onyxia Tooth Pendant", "inv_jewelry_necklace_15", 4, 66),
  hydrated(3, "Truestrike Shoulders", "inv_shoulder_02", 3, 55),
  hydrated(4, "Breastplate of Might", "inv_chest_plate03", 4, 66),
  hydrated(5, "Perdition's Blade", "inv_sword_48", 4, 76),
  hydrated(6, "Drillborer Disk", "inv_shield_11", 4, 66),
]);

const EQUIPPED = {
  [SLOT.head]: 1,
  [SLOT.neck]: 2,
  [SLOT.shoulder]: 3,
  [SLOT.chest]: 4,
  [SLOT.mainHand]: 5,
  [SLOT.offHand]: 6,
};

export const WithCarriedItems: Story = {
  render: () => (
    <div className="max-w-3xl bg-zinc-950 p-6">
      <DerivedSlotGrid
        equipped={EQUIPPED}
        previous={{ ...EQUIPPED, [SLOT.head]: undefined, [SLOT.chest]: undefined }}
        items={ITEMS}
      />
    </div>
  ),
};

export const EmptyPool: Story = {
  render: () => (
    <div className="max-w-3xl bg-zinc-950 p-6">
      <DerivedSlotGrid equipped={{}} items={new Map()} />
    </div>
  ),
};
