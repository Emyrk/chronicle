/** A shortcut listed in the timeline's keyboard popover. */
export interface Keybind {
  keys: string;
  action: string;
}

/** Shortcuts the rotation timeline itself handles. */
export const TIMELINE_KEYBINDS: Keybind[] = [
  { keys: "Hover", action: "Move the yellow line" },
  { keys: "Click", action: "Pin the line at that time (click it again to unpin)" },
  { keys: "Right-click", action: "Unpin" },
  { keys: "Esc", action: "Unpin" },
  { keys: "Drag lanes", action: "Pan" },
  { keys: "Shift + scroll", action: "Pan" },
  { keys: "Drag overview", action: "Zoom to that range" },
  { keys: "F", action: "Toggle Follow" },
  { keys: "Ctrl + click spell", action: "Hide that spell (click it in Ignored to show it)" },
];
