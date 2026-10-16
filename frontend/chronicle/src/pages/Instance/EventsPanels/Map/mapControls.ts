/**
 * Replay map camera keybinds: the actions, their default keys, and the JSON
 * import/export format. Keys are KeyboardEvent.code values, so a binding
 * follows the physical key on any keyboard layout.
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
export type MapKeyBindings = Record<MapControlAction, string>;

export const MAP_CONTROLS_EXPORT_VERSION = 1;

const ACTION_IDS = new Set<string>(MAP_CONTROL_ACTIONS.map((action) => action.id));
// Matches the server's validation (api/map_controls.go).
const KEY_CODE = /^[A-Za-z0-9]{1,32}$/;

export function defaultMapKeyBindings(): MapKeyBindings {
  return Object.fromEntries(MAP_CONTROL_ACTIONS.map((action) => [action.id, action.defaultKey])) as MapKeyBindings;
}

/** The saved overrides over the defaults; unknown actions and bad keys are dropped. */
export function resolveMapKeyBindings(saved: Record<string, string> | null | undefined): MapKeyBindings {
  const bindings = defaultMapKeyBindings();
  for (const [action, key] of Object.entries(saved ?? {})) {
    if (ACTION_IDS.has(action) && KEY_CODE.test(key)) bindings[action as MapControlAction] = key;
  }
  return bindings;
}

/**
 * Keys that cannot be bound: digits switch panel layouts, Escape cancels a
 * rebind, and modifiers never fire on their own in a useful way.
 */
export function reservedKeyReason(code: string): string | null {
  if (/^Digit\d$/.test(code)) return "Number keys switch layouts.";
  if (code === "Escape") return "Escape cancels rebinding.";
  if (/^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/.test(code)) return "Modifier keys cannot be bound.";
  if (!KEY_CODE.test(code)) return "This key cannot be bound.";
  return null;
}

/**
 * Binds `action` to `key`. An action already on that key takes `action`'s old
 * key, so every action keeps exactly one key.
 */
export function rebindMapKey(bindings: MapKeyBindings, action: MapControlAction, key: string): MapKeyBindings {
  const next = { ...bindings };
  const previous = next[action];
  for (const other of MAP_CONTROL_ACTIONS) {
    if (other.id !== action && next[other.id] === key) next[other.id] = previous;
  }
  next[action] = key;
  return next;
}

/** "KeyW" -> "W", "ArrowUp" -> "↑", "Numpad8" -> "Num 8". */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  const arrows: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  return arrows[code] ?? code;
}

export function exportMapControls(bindings: MapKeyBindings): string {
  return JSON.stringify({ version: MAP_CONTROLS_EXPORT_VERSION, bindings }, null, 2);
}

/** Parses an exported file; throws with a readable message when it is not one. */
export function importMapControls(text: string): MapKeyBindings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  const bindings = (parsed as { bindings?: unknown } | null)?.bindings;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
    throw new Error("The file has no \"bindings\" object.");
  }
  let result = defaultMapKeyBindings();
  for (const [action, key] of Object.entries(bindings as Record<string, unknown>)) {
    if (!ACTION_IDS.has(action)) throw new Error(`Unknown action "${action}".`);
    if (typeof key !== "string" || reservedKeyReason(key)) throw new Error(`"${String(key)}" cannot be bound to ${action}.`);
    result = rebindMapKey(result, action as MapControlAction, key);
  }
  return result;
}

/** Only the bindings that differ from the defaults, as the server stores them. */
export function changedMapKeyBindings(bindings: MapKeyBindings): Record<string, string> {
  return Object.fromEntries(MAP_CONTROL_ACTIONS
    .filter((action) => bindings[action.id] !== action.defaultKey)
    .map((action) => [action.id, bindings[action.id]]));
}
