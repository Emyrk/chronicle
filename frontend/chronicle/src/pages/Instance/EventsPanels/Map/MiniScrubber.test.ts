import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TrackProps } from "../../ReplayScrubber";
import { trackScrubberFocus, trackScrubberPointer, type TrackPointerEvent } from "../../replayScrubberTrack";
import { replayStepForKey } from "../../replayStepKey";
import { isReplayToggleKey } from "../../replayToggleKey";
import { MINI_KEY_STEP_MS, MiniScrubber } from "./MiniScrubber";

const bounds = { startMs: 10_000, endMs: 70_000 };

/** The mini scrubber's props as it renders them (MiniScrubber has no hooks of its own), with handlers over a fresh drag state. */
function miniHandlers(nowMs = 40_000) {
  const seek = vi.fn();
  const element = MiniScrubber({ source: { nowMs, bounds, seek } }) as ReactElement<TrackProps>;
  return { seek, handlers: { ...trackScrubberFocus(element.props), ...trackScrubberPointer(element.props, { current: false }) } };
}

/** A stand-in for the slider element and the page around it: which one has focus, and the slider's box. */
function fakePage() {
  const page = { focused: "page" as "page" | "slider", captured: new Set<number>() };
  const slider = {
    setPointerCapture: (id: number) => page.captured.add(id),
    hasPointerCapture: (id: number) => page.captured.has(id),
    getBoundingClientRect: () => ({ left: 100, width: 600 }) as DOMRect,
  };
  const pointer = (clientX: number): TrackPointerEvent => ({ button: 0, pointerId: 1, clientX, preventDefault: vi.fn(), currentTarget: slider });
  return { page, pointer };
}

/** What the browser does on a press: pointerdown, then mousedown, whose default action focuses a focusable element. */
function press(handlers: ReturnType<typeof miniHandlers>["handlers"], page: ReturnType<typeof fakePage>["page"], event: TrackPointerEvent) {
  handlers.onPointerDown(event);
  let prevented = false;
  handlers.onMouseDown?.({ preventDefault: () => { prevented = true; } });
  if (!prevented && handlers.tabIndex !== undefined) page.focused = "slider";
}

/** A keydown target as the page's Q/E/X guards see it: inside the slider, or elsewhere on the page. */
const keyTarget = (focused: "page" | "slider") => ({
  tagName: "DIV",
  isContentEditable: false,
  closest: (selector: string) => (focused === "slider" && selector.includes("[role=slider]") ? {} : null),
}) as unknown as EventTarget;
const key = (code: string, target: EventTarget) => ({ code, target, defaultPrevented: false, repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });

describe("mini map scrubber", () => {
  it("seeks on a press and drag without taking focus, so Q/E/X still reach the replay", () => {
    const { seek, handlers } = miniHandlers();
    const { page, pointer } = fakePage();
    press(handlers, page, pointer(250));
    expect(seek).toHaveBeenLastCalledWith(25_000);
    handlers.onPointerMove(pointer(1_000));
    expect(seek).toHaveBeenLastCalledWith(70_000);
    handlers.onPointerUp(pointer(1_000));
    expect(seek).toHaveBeenCalledTimes(2);

    // Focus stayed where it was, so the page's replay shortcuts still fire.
    expect(page.focused).toBe("page");
    expect(replayStepForKey(key("KeyE", keyTarget(page.focused)))).toBe(1000);
    expect(isReplayToggleKey(key("KeyX", keyTarget(page.focused)))).toBe(true);
  });

  it("is reachable by Tab and seeks with the arrows, Page Up/Down, Home and End once focused", () => {
    const { seek, handlers } = miniHandlers(40_000);
    expect(handlers.tabIndex).toBe(0);
    const preventDefault = vi.fn();
    handlers.onKeyDown?.({ key: "ArrowRight", preventDefault });
    expect(seek).toHaveBeenLastCalledWith(40_000 + MINI_KEY_STEP_MS);
    expect(preventDefault).toHaveBeenCalled();
    handlers.onKeyDown?.({ key: "ArrowLeft", preventDefault });
    expect(seek).toHaveBeenLastCalledWith(40_000 - MINI_KEY_STEP_MS);
    handlers.onKeyDown?.({ key: "PageUp", preventDefault });
    expect(seek).toHaveBeenLastCalledWith(46_000);
    handlers.onKeyDown?.({ key: "Home", preventDefault });
    expect(seek).toHaveBeenLastCalledWith(10_000);
    handlers.onKeyDown?.({ key: "End", preventDefault });
    expect(seek).toHaveBeenLastCalledWith(70_000);
    const ignored = vi.fn();
    handlers.onKeyDown?.({ key: "x", preventDefault: ignored });
    expect(ignored).not.toHaveBeenCalled();
    expect(seek).toHaveBeenCalledTimes(5);
  });

  it("while it has keyboard focus, the page's Q/E/X guards stand down (as on the landing scrubber)", () => {
    expect(replayStepForKey(key("KeyE", keyTarget("slider")))).toBeNull();
    expect(isReplayToggleKey(key("KeyX", keyTarget("slider")))).toBe(false);
  });

  it("leaves a press focusing by default for the other track scrubbers (the landing's)", () => {
    const handlers = trackScrubberFocus(
      { variant: "track", source: { nowMs: 0, bounds, seek: vi.fn() }, tabIndex: 0, aria: { label: "Replay position", valueMin: 0, valueMax: 60, valueNow: 0 }, children: null },
    );
    expect(handlers.onMouseDown).toBeUndefined();
  });
});
