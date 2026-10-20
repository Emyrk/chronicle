import { describe, expect, it } from "vitest";
import { REPLAY_KEY_STEP_MS, replayStepForKey } from "./replayStepKey";

const key = (target: unknown, over: Record<string, unknown> = {}) =>
  ({
    code: "KeyQ",
    defaultPrevented: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target,
    ...over,
  }) as Parameters<typeof replayStepForKey>[0];

const el = (tagName: string, extra: Record<string, unknown> = {}, interactive = false) => ({
  tagName,
  isContentEditable: false,
  closest: () => (interactive ? {} : null),
  ...extra,
});

describe("replayStepForKey", () => {
  it("rewinds with Q and fast-forwards with E", () => {
    expect(replayStepForKey(key(el("BODY")))).toBe(-REPLAY_KEY_STEP_MS);
    expect(replayStepForKey(key(el("BODY"), { code: "KeyE" }))).toBe(REPLAY_KEY_STEP_MS);
  });

  it("allows held Q/E presses to keep stepping", () => {
    expect(replayStepForKey(key(el("BODY"), { repeat: true }))).toBe(-REPLAY_KEY_STEP_MS);
  });

  it("ignores other keys, modifiers and handled events", () => {
    expect(replayStepForKey(key(el("BODY"), { code: "KeyA" }))).toBeNull();
    expect(replayStepForKey(key(el("BODY"), { ctrlKey: true }))).toBeNull();
    expect(replayStepForKey(key(el("BODY"), { shiftKey: true }))).toBeNull();
    expect(replayStepForKey(key(el("BODY"), { defaultPrevented: true }))).toBeNull();
  });

  it("ignores text entry and focused interactive elements", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(replayStepForKey(key(el(tag)))).toBeNull();
    }
    expect(replayStepForKey(key(el("DIV", { isContentEditable: true })))).toBeNull();
    expect(replayStepForKey(key(el("BUTTON", {}, true)))).toBeNull();
  });
});
