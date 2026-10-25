import { describe, expect, it } from "vitest";
import {
  BACKGROUND_STYLES,
  BORDER_STYLES,
  NAME_STYLES,
  combineCosmetics,
  selectionFromAPI,
  selectionSummary,
  selectionToAPI,
} from "./PlayerCosmetics";

describe("player cosmetics", () => {
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

  it("summarizes only non-default selections", () => {
    expect(selectionSummary({ name: "none", background: "none", border: "none" })).toBe("Default");
    expect(selectionSummary({ name: "gilded", background: "satin", border: "none" })).toBe("Gilded · Satin");
  });
});
