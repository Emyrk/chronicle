/**
 * Key guard for the X play/pause shortcut of the replay controls.
 */
import { useEffect, useRef } from "react";

const TEXT_ENTRY = /^(INPUT|TEXTAREA|SELECT)$/;
const INTERACTIVE_ELEMENTS =
  "button, a[href], summary, [role=button], [role=checkbox], [role=switch], [role=radio], [role=tab], [role=menuitem], [role=option], [role=slider]";

/** True when a keydown should toggle replay play/pause. */
export function isReplayToggleKey(
  event: Pick<KeyboardEvent, "code" | "defaultPrevented" | "repeat" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"> & {
    target: EventTarget | null;
  }
): boolean {
  if (event.code !== "KeyX" || event.defaultPrevented || event.repeat) return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  const target = event.target as HTMLElement | null;
  if (!target) return true;
  if (target.isContentEditable || TEXT_ENTRY.test(target.tagName)) return false;
  return !target.closest?.(INTERACTIVE_ELEMENTS);
}

/** What an X press did: "play" or "pause". */
export type ReplayToggle = "play" | "pause";

/** Window event an X press dispatches, for ReplayToggleFlash; `detail` is the ReplayToggle. */
export const REPLAY_TOGGLE_EVENT = "chronicle:replay-toggle";

/**
 * X toggles replay play/pause while the calling control is mounted (the Replay
 * overlay, a Replay strip). `toggle` returns what it did, or null when it
 * could not act (e.g. YouTube drives playback). A handled press is marked
 * handled, so with several controls mounted X still toggles once, and it
 * announces itself (REPLAY_TOGGLE_EVENT) so the page can flash the icon.
 */
export function useReplayToggleKey(toggle: () => ReplayToggle | null) {
  const toggleRef = useRef(toggle);
  useEffect(() => {
    toggleRef.current = toggle;
  });
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isReplayToggleKey(event)) return;
      const action = toggleRef.current();
      if (!action) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent<ReplayToggle>(REPLAY_TOGGLE_EVENT, { detail: action }));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
