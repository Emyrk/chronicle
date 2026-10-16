export const PANEL_LAYOUT_CARDS = "cards";
export const PANEL_LAYOUT_SEAMLESS = "seamless";

export type PanelLayout = typeof PANEL_LAYOUT_CARDS | typeof PANEL_LAYOUT_SEAMLESS;

export function getPanelLayout(value: string | undefined): PanelLayout {
  return value === PANEL_LAYOUT_SEAMLESS ? PANEL_LAYOUT_SEAMLESS : PANEL_LAYOUT_CARDS;
}
