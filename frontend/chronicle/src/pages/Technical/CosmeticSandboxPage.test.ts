import { describe, expect, it } from "vitest";
import {
  BACKGROUND_STYLES,
  BORDER_STYLES,
  NAME_STYLES,
} from "@/components/ui/PlayerMetricChart/PlayerCosmetics";
import { cosmeticPreviewCatalog } from "./cosmeticPreviewCatalog";

describe("cosmeticPreviewCatalog", () => {
  it("exposes every non-default cosmetic to the public sandbox", () => {
    const catalog = cosmeticPreviewCatalog();
    const expectedCount = Object.keys(NAME_STYLES).length
      + Object.keys(BACKGROUND_STYLES).length
      + Object.keys(BORDER_STYLES).length
      - 3;

    expect(catalog).toHaveLength(expectedCount);
    expect(new Set(catalog.map(({ id }) => id)).size).toBe(expectedCount);
    expect(catalog).toContainEqual({
      id: "name_thunderfury",
      label: "Thunderfury",
      slot: "name",
      tier: "exalted",
    });
    expect(catalog).toContainEqual({
      id: "background_inner_glow",
      label: "Inner Glow",
      slot: "background",
      tier: "revered",
    });
    expect(catalog).toContainEqual({
      id: "border_chasing",
      label: "Chasing Light",
      slot: "border",
      tier: "exalted",
    });
  });
});
