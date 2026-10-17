/**
 * Fixed replay map camera controls. Keys are KeyboardEvent.code values, so a
 * control follows the physical key on any keyboard layout.
 */

export const MAP_CONTROL_ACTIONS = [
  { id: "move_forward", label: "Move forward", defaultKey: "KeyW" },
  { id: "move_back", label: "Move back", defaultKey: "KeyS" },
  { id: "move_left", label: "Move left", defaultKey: "KeyA" },
  { id: "move_right", label: "Move right", defaultKey: "KeyD" },
  { id: "rotate_left", label: "Rotate left", defaultKey: "KeyQ" },
  { id: "rotate_right", label: "Rotate right", defaultKey: "KeyE" },
  { id: "zoom_in", label: "Zoom in", defaultKey: "KeyR" },
  { id: "zoom_out", label: "Zoom out", defaultKey: "KeyF" },
] as const;

export type MapControlAction = (typeof MAP_CONTROL_ACTIONS)[number]["id"];

/** "KeyW" -> "W", "ArrowUp" -> "↑", "Numpad8" -> "Num 8". */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  const arrows: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  return arrows[code] ?? code;
}

export const MAP_CONTROL_KEYBINDS = MAP_CONTROL_ACTIONS.map((action) => ({
  keys: keyLabel(action.defaultKey),
  action: `${action.label} while the pointer is over the map`,
}));
