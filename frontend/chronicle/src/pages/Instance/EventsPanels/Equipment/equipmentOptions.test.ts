import { describe, expect, it } from "vitest";
import {
  parseEquipmentPanelOption,
  serializeEquipmentPanelOption,
} from "./equipmentOptions";

describe("equipment panel options", () => {
  it("serializes the selected player and talents tab", () => {
    expect(serializeEquipmentPanelOption("player-guid", "talents")).toBe(
      "p:player-guid,t:talents",
    );
  });

  it("omits the default gear tab", () => {
    expect(serializeEquipmentPanelOption("player-guid", "gear")).toBe(
      "p:player-guid",
    );
  });

  it("round trips persisted selections", () => {
    const option = serializeEquipmentPanelOption("0x0000000000001234", "talents");

    expect(parseEquipmentPanelOption(option)).toEqual({
      playerGuid: "0x0000000000001234",
      subTab: "talents",
    });
  });

  it("ignores malformed and unrelated tokens", () => {
    expect(parseEquipmentPanelOption("other,t:unknown,p:")).toEqual({
      playerGuid: null,
      subTab: null,
    });
  });
});
