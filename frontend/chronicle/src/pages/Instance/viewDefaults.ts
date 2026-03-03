import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import type { EventsPanelType } from "./EventsPanels";

export const DEFAULT_INSTANCE_LAYOUT_ITEMS: GridEditorItem[] = [
  { id: "panel-1", title: "Damage Done", x: 0, y: 0, w: 6, h: 5, minW: 4 },
  { id: "panel-2", title: "Healing Done", x: 6, y: 0, w: 6, h: 5, minW: 4 },
  { id: "panel-3", title: "Damage Taken", x: 0, y: 4, w: 6, h: 4, minW: 4 },
  { id: "panel-4", title: "Enemy Damage", x: 6, y: 4, w: 6, h: 4, minW: 4 },
  { id: "panel-5", title: "All Activity", x: 0, y: 8, w: 12, h: 4, minW: 4 },
];

export const DEFAULT_INSTANCE_PANEL_TYPES: Record<string, EventsPanelType> = {
  "panel-1": "damage_done",
  "panel-2": "healing_done",
  "panel-3": "damage_taken",
  "panel-4": "enemy_damage_done",
  "panel-5": "all_activity",
};
