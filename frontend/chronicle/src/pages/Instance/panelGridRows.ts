import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";

export const PANEL_GRID_ROW_HEIGHT_PX = 96;

/**
 * Build explicit grid tracks when a layout contains intrinsic-height panels or
 * uses focus-fit rows. Content panels must occupy one logical row.
 */
export function panelGridTemplateRows(
  items: readonly GridEditorItem[],
  contentHeightItemIds: ReadonlySet<string>,
  fit: boolean,
): string | null {
  if (!fit && contentHeightItemIds.size === 0) return null;

  const rowCount = Math.max(0, ...items.map((item) => item.y + item.h));
  return Array.from({ length: rowCount }, (_, row) => {
    const covering = items.filter((item) => row >= item.y && row < item.y + item.h);
    if (covering.some((item) => contentHeightItemIds.has(item.id))) return "auto";

    const stripOnly = covering.length > 0 && covering.every((item) => item.kind === "strip");
    if (fit && !stripOnly) return `minmax(${PANEL_GRID_ROW_HEIGHT_PX}px, 1fr)`;
    return `${PANEL_GRID_ROW_HEIGHT_PX}px`;
  }).join(" ");
}
