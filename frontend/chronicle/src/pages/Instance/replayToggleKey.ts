/**
 * Key guard for the K play/pause shortcut of the replay controls.
 */

const TEXT_ENTRY = /^(INPUT|TEXTAREA|SELECT)$/;
const INTERACTIVE_ELEMENTS =
  "button, a[href], summary, [role=button], [role=checkbox], [role=switch], [role=radio], [role=tab], [role=menuitem], [role=option], [role=slider]";

/** True when a keydown should toggle replay play/pause. */
export function isReplayToggleKey(
  event: Pick<KeyboardEvent, "code" | "defaultPrevented" | "repeat" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"> & {
    target: EventTarget | null;
  }
): boolean {
  if (event.code !== "KeyK" || event.defaultPrevented || event.repeat) return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  const target = event.target as HTMLElement | null;
  if (!target) return true;
  if (target.isContentEditable || TEXT_ENTRY.test(target.tagName)) return false;
  return !target.closest?.(INTERACTIVE_ELEMENTS);
}
