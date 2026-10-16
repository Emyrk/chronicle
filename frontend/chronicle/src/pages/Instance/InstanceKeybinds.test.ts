import { describe, expect, it } from "vitest";
import {
  collapseInstanceKeybindGroups,
  removeInstanceKeybindGroup,
  setInstanceKeybindGroup,
  type InstanceKeybindGroup,
} from "./InstanceKeybinds";

const mapGroup: InstanceKeybindGroup = {
  id: "panel:map",
  label: "Map",
  keybinds: [{ keys: "W", action: "Move forward" }],
};

describe("instance keybind registry", () => {
  it("adds and replaces a source without disturbing other sources", () => {
    const pageGroup: InstanceKeybindGroup = {
      id: "instance-page",
      label: "Instance page",
      keybinds: [{ keys: "0–9", action: "Apply a layout" }],
    };
    const initial = new Map([[pageGroup.id, pageGroup]]);

    const withMap = setInstanceKeybindGroup(initial, mapGroup);
    const rebound = setInstanceKeybindGroup(withMap, {
      ...mapGroup,
      keybinds: [{ keys: "↑", action: "Move forward" }],
    });

    expect([...rebound.keys()]).toEqual(["instance-page", "panel:map"]);
    expect(rebound.get("panel:map")?.keybinds[0]?.keys).toBe("↑");
  });

  it("preserves identity for unchanged reports and missing removals", () => {
    const current = new Map([[mapGroup.id, mapGroup]]);

    expect(setInstanceKeybindGroup(current, { ...mapGroup, keybinds: [...mapGroup.keybinds] }))
      .toBe(current);
    expect(removeInstanceKeybindGroup(current, "missing")).toBe(current);
  });

  it("lists identical shortcuts from multiple panels only once", () => {
    const focusKeybind = { keys: "Esc", action: "Return from a focused player to the player list" };
    const groups = collapseInstanceKeybindGroups([
      { id: "damage", label: "Damage Done", keybinds: [focusKeybind] },
      { id: "healing", label: "Healing Done", keybinds: [focusKeybind] },
      { id: "map", label: "Map", keybinds: [{ keys: "W", action: "Move forward" }] },
    ]);

    expect(groups).toEqual([
      { id: "shared-panel-keybinds", label: "Panels", keybinds: [focusKeybind] },
      { id: "map", label: "Map", keybinds: [{ keys: "W", action: "Move forward" }] },
    ]);
  });

  it("removes a source when its reporter unmounts", () => {
    const current = new Map([[mapGroup.id, mapGroup]]);

    expect(removeInstanceKeybindGroup(current, mapGroup.id).has(mapGroup.id)).toBe(false);
  });
});
