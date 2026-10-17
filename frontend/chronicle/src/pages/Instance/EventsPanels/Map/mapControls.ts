/**
 * Fixed replay map controls, WoW-style. Keys are KeyboardEvent.code values,
 * so a control follows the physical key on any keyboard layout. The same keys
 * drive the orbit camera and walk mode ("join the fight"), each its own way.
 */

export const MAP_CONTROL_ACTIONS = [
  { id: "forward", label: "Move forward", defaultKey: "KeyW" },
  { id: "back", label: "Move back", defaultKey: "KeyS" },
  { id: "turn_left", label: "Turn left", defaultKey: "KeyA" },
  { id: "turn_right", label: "Turn right", defaultKey: "KeyD" },
  { id: "strafe_left", label: "Strafe left", defaultKey: "KeyQ" },
  { id: "strafe_right", label: "Strafe right", defaultKey: "KeyE" },
  { id: "up", label: "Up", defaultKey: "Space" },
  { id: "down", label: "Down", defaultKey: "KeyX" },
] as const;

export type MapControlAction = (typeof MAP_CONTROL_ACTIONS)[number]["id"];

/** Toggles walk mode while the pointer is over the map (or while walking). */
export const WALK_TOGGLE_KEY = "KeyG";

/** "KeyW" -> "W", "ArrowUp" -> "↑", "Numpad8" -> "Num 8". */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  const arrows: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  return arrows[code] ?? code;
}

/** For the instance page's keybind help. */
export const MAP_CONTROL_KEYBINDS = [
  { keys: "W / S", action: "Move forward / back (pointer over the map, or while walking)" },
  { keys: "A / D", action: "Turn left / right" },
  { keys: "Q / E", action: "Strafe left / right" },
  { keys: "Space / X", action: "Zoom out / in; while walking: jump (hold to fly up) / fly down" },
  { keys: keyLabel(WALK_TOGGLE_KEY), action: "Walk mode on / off: join the fight on the ground" },
  { keys: "Esc", action: "Leave walk mode" },
  { keys: "Drag / right-drag", action: "While walking: look around / turn your character" },
  { keys: "Mouse wheel", action: "Zoom; while walking, all the way in is first person" },
];
