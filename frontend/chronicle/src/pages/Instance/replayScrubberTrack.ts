import type { TrackProps } from "./ReplayScrubber";
import { scrubDrag, scrubKeyTarget, timeAtFraction, type ScrubPointerEvent } from "./replayScrubberModel";

/** The bits of a pointer event the track reads (a React PointerEvent in the app; a stand-in in tests). */
export interface TrackPointerEvent {
  button: number;
  pointerId: number;
  clientX: number;
  preventDefault: () => void;
  currentTarget: Pick<HTMLElement, "setPointerCapture" | "hasPointerCapture" | "getBoundingClientRect">;
}

/** The bits of a key event the track reads. */
export interface TrackKeyEvent {
  key: string;
  preventDefault: () => void;
}

/**
 * The track slider's focus and keys: what it needs while rendering. Plain
 * functions over its props, so they are testable without a DOM.
 */
export function trackScrubberFocus(props: TrackProps) {
  const { source, disabled = false, keyboard, tabIndex, focusOnPress = true } = props;
  return {
    tabIndex: tabIndex ?? (keyboard ? 0 : undefined),
    // A mouse or touch press must not move focus (the browser focuses on mousedown): a focused slider would swallow
    // the page's Q/E/X replay keys. Pointer capture comes from pointerdown, so dragging is unaffected; Tab still focuses.
    onMouseDown: focusOnPress ? undefined : (event: Pick<TrackPointerEvent, "preventDefault">) => event.preventDefault(),
    onKeyDown: keyboard
      ? (event: TrackKeyEvent) => {
        if (disabled || !source.bounds) return;
        const target = scrubKeyTarget(event.key, source.nowMs ?? source.bounds.startMs, source.bounds, keyboard);
        if (target === null) return;
        event.preventDefault();
        source.seek(target);
      }
      : undefined,
  };
}

/** The track slider's pointer handlers over its drag state (called from event handlers only). */
export function trackScrubberPointer(props: TrackProps, dragging: { current: boolean }) {
  const { source, disabled = false, measureRef, preventDefaultOnPress = false, onScrub, onScrubCancel } = props;
  const rectOf = (event: TrackPointerEvent) => (measureRef?.current ?? event.currentTarget).getBoundingClientRect();
  const handle = (pointer: ScrubPointerEvent) => {
    const next = scrubDrag(dragging.current, pointer, disabled);
    dragging.current = next.dragging;
    if (!next.scrub || !source.bounds) return;
    const ms = timeAtFraction(next.scrub.fraction, source.bounds);
    if (onScrub) onScrub(ms, next.scrub.phase);
    else if (next.scrub.phase !== "end") source.seek(ms);
  };
  return {
    onPointerDown: (event: TrackPointerEvent) => {
      if (disabled || event.button !== 0) return;
      if (preventDefaultOnPress) event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      handle({ type: "down", button: event.button, clientX: event.clientX, rect: rectOf(event) });
    },
    onPointerMove: (event: TrackPointerEvent) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      handle({ type: "move", clientX: event.clientX, rect: rectOf(event) });
    },
    onPointerUp: (event: TrackPointerEvent) => {
      handle({ type: "up", clientX: event.clientX, rect: rectOf(event) });
    },
    onPointerCancel: () => {
      dragging.current = scrubDrag(dragging.current, { type: "cancel" }).dragging;
      onScrubCancel?.();
    },
  };
}

