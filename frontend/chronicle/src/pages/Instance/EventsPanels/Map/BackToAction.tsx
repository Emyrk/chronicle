import { LocateFixed } from "lucide-react";
import { KeybindTooltip } from "./MapChrome";
import { keyLabel } from "./mapControls";
import { BACK_TO_ACTION_KEY } from "./followHandoff";

/** The way back's label, hint and key, shared by every host (chronicle-2020). */
export const BACK_TO_ACTION_LABEL = "Back to the action";
export const BACK_TO_ACTION_HINT = "Return to following the group";
export const BACK_TO_ACTION_KEYCAP = keyLabel(BACK_TO_ACTION_KEY);

/**
 * "Back to the action": shown once the viewer has taken the camera from the
 * follow camera; one click (or R over the map) hands it back, as Follow does.
 * `compact`: the icon alone (the label is its hover hint and aria-label), for
 * the mini map's narrow row. `keybind`: show the key in its hover hint.
 */
export function BackToActionButton({ onClick, className, compact = false, keybind = true }: { onClick: () => void; className: string; compact?: boolean; keybind?: boolean }) {
  const button = (
    <button type="button" onClick={onClick} aria-label={BACK_TO_ACTION_LABEL} title={keybind ? undefined : BACK_TO_ACTION_LABEL} className={className}>
      <LocateFixed className="h-3 w-3" />
      {!compact && BACK_TO_ACTION_LABEL}
    </button>
  );
  if (!keybind) return button;
  return <KeybindTooltip label={compact ? `${BACK_TO_ACTION_LABEL}: ${BACK_TO_ACTION_HINT.toLowerCase()}` : BACK_TO_ACTION_HINT} keys={[[BACK_TO_ACTION_KEYCAP]]}>{button}</KeybindTooltip>;
}
