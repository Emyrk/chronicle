import type { PanelProcessor } from "../types";

export type LootResult = Record<string, never>;

export const lootProcessor: PanelProcessor<LootResult> = {
  id: "loot",
  streams: [],
  createState: (): LootResult => ({}),
  processEvent: () => {},
};
