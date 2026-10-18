import { describe, expect, it } from "vitest";
import { isReplayToggleKey } from "./replayToggleKey";

const key = (target: unknown, over: Record<string, unknown> = {}) =>
  ({
    code: "KeyK",
    defaultPrevented: false,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target,
    ...over,
  }) as Parameters<typeof isReplayToggleKey>[0];

const el = (tagName: string, extra: Record<string, unknown> = {}, interactive = false) => ({
  tagName,
  isContentEditable: false,
  closest: () => (interactive ? {} : null),
  ...extra,
});

describe("isReplayToggleKey", () => {
  it("toggles on a plain K from the body", () => {
    expect(isReplayToggleKey(key(el("BODY")))).toBe(true);
    expect(isReplayToggleKey(key(null))).toBe(true);
  });

  it("ignores Space, other keys, modifiers, repeats and handled events", () => {
    expect(isReplayToggleKey(key(el("BODY"), { code: "Space" }))).toBe(false);
    expect(isReplayToggleKey(key(el("BODY"), { code: "KeyA" }))).toBe(false);
    expect(isReplayToggleKey(key(el("BODY"), { ctrlKey: true }))).toBe(false);
    expect(isReplayToggleKey(key(el("BODY"), { shiftKey: true }))).toBe(false);
    expect(isReplayToggleKey(key(el("BODY"), { repeat: true }))).toBe(false);
    expect(isReplayToggleKey(key(el("BODY"), { defaultPrevented: true }))).toBe(false);
  });

  it("ignores text entry", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(isReplayToggleKey(key(el(tag)))).toBe(false);
    }
    expect(isReplayToggleKey(key(el("DIV", { isContentEditable: true })))).toBe(false);
  });

  it("ignores focused interactive elements", () => {
    expect(isReplayToggleKey(key(el("BUTTON", {}, true)))).toBe(false);
    expect(isReplayToggleKey(key(el("TR", {}, true)))).toBe(false);
  });
});
