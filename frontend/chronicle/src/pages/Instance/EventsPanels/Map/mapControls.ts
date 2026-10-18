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

// With A/D strafe (a saved map setting, on by default), A/D and Q/E trade places.
const STRAFE_SWAP: Partial<Record<MapControlAction, MapControlAction>> = {
  turn_left: "strafe_left",
  turn_right: "strafe_right",
  strafe_left: "turn_left",
  strafe_right: "turn_right",
};

/** The action a key drives, with A/D strafing (the default) or turning. */
export function actionForKey(code: string, adStrafe: boolean): MapControlAction | undefined {
  const action = MAP_CONTROL_ACTIONS.find((candidate) => candidate.defaultKey === code)?.id;
  return action && adStrafe ? STRAFE_SWAP[action] ?? action : action;
}

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
  { keys: "A / D", action: "Strafe left / right (turn with \"A/D strafe\" off in Map settings → Controls)" },
  { keys: "Q / E", action: "Turn left / right (strafe with \"A/D strafe\" off)" },
  { keys: "Space / X", action: "Zoom out / in; while walking: jump (hold to fly up) / fly down" },
  { keys: keyLabel(WALK_TOGGLE_KEY), action: "Walk mode on / off: join the fight on the ground" },
  { keys: "Esc", action: "Leave walk mode" },
  { keys: "Drag / right-drag", action: "While walking: look around / turn your character (the cursor hides while you drag)" },
  { keys: "Right-drag + A / D", action: "While walking: strafe left / right, whatever A/D strafe is set to" },
  { keys: "Mouse wheel", action: "Zoom; while walking, all the way in is first person" },
];
