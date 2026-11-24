export function updatePanelOptionState<T extends { panelOptions: Array<string | null> }>(
  state: T,
  index: number,
  option: string | null,
): T {
  // Panels can report their current options again after a parent render.
  // Preserve identity for no-op reports so effect-driven panels cannot create
  // a report → parent render → report feedback loop.
  if ((state.panelOptions[index] ?? null) === option) return state;

  const panelOptions = [...state.panelOptions];
  while (panelOptions.length <= index) panelOptions.push(null);
  panelOptions[index] = option;
  return { ...state, panelOptions };
}
