import { describe, expect, it } from "vitest";
import { isReplaySpaceToggle } from "./replaySpaceKey";

const key = (target: unknown, over: Record<string, unknown> = {}) =>
  ({
    code: "Space",
    defaultPrevented: false,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target,
    ...over,
  }) as Parameters<typeof isReplaySpaceToggle>[0];

const el = (tagName: string, extra: Record<string, unknown> = {}, owner = false) => ({
  tagName,
  isContentEditable: false,
  closest: () => (owner ? {} : null),
  ...extra,
});

describe("isReplaySpaceToggle", () => {
  it("toggles on a plain Space from the body", () => {
    expect(isReplaySpaceToggle(key(el("BODY")))).toBe(true);
    expect(isReplaySpaceToggle(key(null))).toBe(true);
  });

  it("ignores other keys, modifiers, repeats and handled events", () => {
    expect(isReplaySpaceToggle(key(el("BODY"), { code: "KeyA" }))).toBe(false);
    expect(isReplaySpaceToggle(key(el("BODY"), { ctrlKey: true }))).toBe(false);
    expect(isReplaySpaceToggle(key(el("BODY"), { shiftKey: true }))).toBe(false);
    expect(isReplaySpaceToggle(key(el("BODY"), { repeat: true }))).toBe(false);
    expect(isReplaySpaceToggle(key(el("BODY"), { defaultPrevented: true }))).toBe(false);
  });

  it("ignores text entry", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(isReplaySpaceToggle(key(el(tag)))).toBe(false);
    }
    expect(isReplaySpaceToggle(key(el("DIV", { isContentEditable: true })))).toBe(false);
  });

  it("leaves Space to focused buttons and role=button rows", () => {
    expect(isReplaySpaceToggle(key(el("BUTTON", {}, true)))).toBe(false);
    expect(isReplaySpaceToggle(key(el("TR", {}, true)))).toBe(false);
  });
});
