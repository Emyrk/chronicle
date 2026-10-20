import { useEffect, useRef } from "react";

const TEXT_ENTRY = /^(INPUT|TEXTAREA|SELECT)$/;
const INTERACTIVE_ELEMENTS =
  "button, a[href], summary, [role=button], [role=checkbox], [role=switch], [role=radio], [role=tab], [role=menuitem], [role=option], [role=slider]";

export const REPLAY_KEY_STEP_MS = 1000;

/** The replay step for a plain Q/E press, or null when the key should be ignored. */
export function replayStepForKey(
  event: Pick<KeyboardEvent, "code" | "defaultPrevented" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"> & {
    target: EventTarget | null;
  },
): number | null {
  const delta = event.code === "KeyQ" ? -REPLAY_KEY_STEP_MS : event.code === "KeyE" ? REPLAY_KEY_STEP_MS : null;
  if (delta === null || event.defaultPrevented) return null;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  const target = event.target as HTMLElement | null;
  if (!target) return delta;
  if (target.isContentEditable || TEXT_ENTRY.test(target.tagName)) return null;
  return target.closest?.(INTERACTIVE_ELEMENTS) ? null : delta;
}

/** Q rewinds and E fast-forwards while the calling replay surface can seek. */
export function useReplayStepKeys(step: (deltaMs: number) => boolean) {
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const delta = replayStepForKey(event);
      if (delta === null || !stepRef.current(delta)) return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
