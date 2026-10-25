import type { CosmeticDefinition } from "@/api/typesGenerated";
import {
  BACKGROUND_STYLES,
  BORDER_STYLES,
  DEFAULT_COSMETIC_SELECTION,
  NAME_STYLES,
  selectionToAPI,
  type CosmeticStyleSelection,
  type Preset,
} from "@/components/ui/PlayerMetricChart/PlayerCosmetics";

const STYLE_SLOTS = [
  ["name", NAME_STYLES],
  ["background", BACKGROUND_STYLES],
  ["border", BORDER_STYLES],
] as const satisfies readonly (readonly [keyof CosmeticStyleSelection, Record<string, Preset>])[];

export function cosmeticPreviewCatalog(): CosmeticDefinition[] {
  return STYLE_SLOTS.flatMap(([slot, styles]) => Object.entries(styles).flatMap(([key, preset]) => {
    if (key === "none") return [];
    const selection = { ...DEFAULT_COSMETIC_SELECTION, [slot]: key } as CosmeticStyleSelection;
    const apiSelection = selectionToAPI(selection);
    const id = slot === "name"
      ? apiSelection.name_id
      : slot === "background"
        ? apiSelection.background_id
        : apiSelection.border_id;
    return [{ id, label: preset.label, slot, tier: preset.tier.toLowerCase() }];
  }));
}
