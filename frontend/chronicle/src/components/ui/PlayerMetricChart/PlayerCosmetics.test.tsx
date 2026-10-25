import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CharacterCosmeticsEditor } from "@/features/characterCosmetics/CharacterCosmeticsEditor";
import type { CosmeticDefinition, LinkedCharacter } from "@/api/typesGenerated";
import {
  BACKGROUND_STYLES,
  BORDER_STYLES,
  NAME_STYLES,
  combineCosmetics,
  limitedTreatment,
  selectionFromAPI,
  selectionSummary,
  selectionToAPI,
  supporterTier,
} from "./PlayerCosmetics";

const character: LinkedCharacter = {
  link_id: "link-1",
  user_id: "user-1",
  character_guid: "character-1",
  realm_id: "realm-1",
  realm_name: "Nordanaar",
  name: "Crashproof",
  class: "Mage",
  race: "Gnome",
  gender: "Female",
  level: 60,
  is_primary: false,
  link_source: "manual",
  linked_at: "2026-10-25T00:00:00Z",
};

describe("player cosmetics", () => {
  it("does not crash when an older backend returns null cosmetic arrays", () => {
    expect(() => renderToStaticMarkup(
      <CharacterCosmeticsEditor
        character={character}
        catalog={null}
        allowedIDs={null}
        open={false}
        saving={false}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />,
    )).not.toThrow();
  });

  it("round-trips API IDs, including camel-cased style keys", () => {
    const selection = {
      name: "thunderfury" as const,
      background: "innerGlow" as const,
      border: "chasing" as const,
    };

    expect(selectionToAPI(selection)).toEqual({
      name_id: "name_thunderfury",
      background_id: "background_inner_glow",
      border_id: "border_chasing",
    });
    expect(selectionFromAPI(selectionToAPI(selection))).toEqual(selection);
  });

  it("falls back to default for unknown or cross-slot IDs", () => {
    expect(selectionFromAPI({
      name_id: "background_glossy",
      background_id: "background_missing",
      border_id: "",
    })).toEqual({ name: "none", background: "none", border: "none" });
  });

  it("combines the selected name, background, and border treatments", () => {
    expect(combineCosmetics({ name: "holy", background: "embers", border: "elite" })).toEqual({
      ...NAME_STYLES.holy.cosmetic,
      ...BACKGROUND_STYLES.embers.cosmetic,
      ...BORDER_STYLES.elite.cosmetic,
    });
  });

  it("freezes still presets and hides the rest in limited mode", () => {
    expect(combineCosmetics({ name: "gilded", background: "embers", border: "elite" }, "limited")).toEqual({
      ...NAME_STYLES.gilded.cosmetic,
      ...BACKGROUND_STYLES.embers.cosmetic,
      barClassName: "cosmetic-bar-embers cosmetic-still",
      borderClassName: "cosmetic-border-elite cosmetic-still",
    });

    expect(combineCosmetics({ name: "shimmer", background: "gleam", border: "chasing" }, "limited")).toEqual({});
  });

  it("removes every slot in disabled mode", () => {
    expect(combineCosmetics({ name: "gilded", background: "satin", border: "elite" }, "disabled")).toEqual({});
  });

  it("gives every flashy preset a limited treatment and leaves static ones unchanged", () => {
    for (const preset of [...Object.values(NAME_STYLES), ...Object.values(BACKGROUND_STYLES), ...Object.values(BORDER_STYLES)]) {
      expect(limitedTreatment(preset)).toBe("flashy" in preset ? ("limited" in preset ? "still" : "hidden") : "unchanged");
    }
  });

  it("summarizes only non-default selections", () => {
    expect(selectionSummary({ name: "none", background: "none", border: "none" })).toBe("Default");
    expect(selectionSummary({ name: "gilded", background: "satin", border: "none" })).toBe("Gilded · Satin");
  });

  it("derives the supporter tier from the highest allowed cosmetic", () => {
    const catalog: CosmeticDefinition[] = [
      { id: "name_rare", label: "Rare", slot: "name", tier: "honored" },
      { id: "name_holy", label: "Holy Light", slot: "name", tier: "revered" },
      { id: "border_elite", label: "Elite", slot: "border", tier: "exalted" },
      { id: "name_unassigned", label: "Unassigned", slot: "name" },
    ];

    expect(supporterTier(catalog, [])).toBe("Free");
    expect(supporterTier(catalog, ["name_unassigned"])).toBe("Free");
    expect(supporterTier(catalog, ["name_rare"])).toBe("Honored");
    expect(supporterTier(catalog, ["name_rare", "name_holy"])).toBe("Revered");
    expect(supporterTier(catalog, ["border_elite", "name_rare"])).toBe("Exalted");
  });
});
