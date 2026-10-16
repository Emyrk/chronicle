import { describe, expect, it } from "vitest";
import {
  changedMapKeyBindings,
  defaultMapKeyBindings,
  exportMapControls,
  importMapControls,
  keyLabel,
  rebindMapKey,
  reservedKeyReason,
  resolveMapKeyBindings,
} from "./mapControls";

describe("mapControls", () => {
  it("defaults to WASD with Q/E rotate and R/F zoom", () => {
    const bindings = defaultMapKeyBindings();
    expect([bindings.move_forward, bindings.move_left, bindings.move_back, bindings.move_right]).toEqual(["KeyW", "KeyA", "KeyS", "KeyD"]);
    expect([bindings.rotate_left, bindings.rotate_right, bindings.zoom_in, bindings.zoom_out]).toEqual(["KeyQ", "KeyE", "KeyR", "KeyF"]);
  });

  it("applies saved overrides and drops unknown or invalid ones", () => {
    const bindings = resolveMapKeyBindings({ move_forward: "ArrowUp", jump: "Space", move_back: "<bad>" });
    expect(bindings.move_forward).toBe("ArrowUp");
    expect(bindings.move_back).toBe("KeyS");
    expect("jump" in bindings).toBe(false);
  });

  it("swaps keys so each action keeps exactly one", () => {
    const next = rebindMapKey(defaultMapKeyBindings(), "move_forward", "KeyS");
    expect(next.move_forward).toBe("KeyS");
    expect(next.move_back).toBe("KeyW");
  });

  it("stores only what differs from the defaults", () => {
    expect(changedMapKeyBindings(defaultMapKeyBindings())).toEqual({});
    expect(changedMapKeyBindings(rebindMapKey(defaultMapKeyBindings(), "zoom_in", "KeyT"))).toEqual({ zoom_in: "KeyT" });
  });

  it("round-trips through export and import", () => {
    const custom = rebindMapKey(defaultMapKeyBindings(), "rotate_left", "ArrowLeft");
    expect(importMapControls(exportMapControls(custom))).toEqual(custom);
  });

  it("rejects malformed imports", () => {
    expect(() => importMapControls("not json")).toThrow("not valid JSON");
    expect(() => importMapControls("{}")).toThrow("no \"bindings\"");
    expect(() => importMapControls(JSON.stringify({ bindings: { fly: "KeyX" } }))).toThrow("Unknown action");
    expect(() => importMapControls(JSON.stringify({ bindings: { move_forward: "Digit1" } }))).toThrow("cannot be bound");
  });

  it("reserves digits, Escape and modifiers", () => {
    expect(reservedKeyReason("Digit3")).toMatch(/layouts/);
    expect(reservedKeyReason("Escape")).not.toBeNull();
    expect(reservedKeyReason("ShiftLeft")).not.toBeNull();
    expect(reservedKeyReason("KeyW")).toBeNull();
  });

  it("labels keys like a keyboard", () => {
    expect(keyLabel("KeyW")).toBe("W");
    expect(keyLabel("ArrowUp")).toBe("↑");
    expect(keyLabel("Numpad8")).toBe("Num 8");
    expect(keyLabel("Space")).toBe("Space");
  });
});
