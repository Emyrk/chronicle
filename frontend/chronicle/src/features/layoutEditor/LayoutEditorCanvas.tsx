import { useState, type ReactNode } from "react";
import { LayoutPanelTop, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GridLayoutEditor, type GridEditorItem } from "@/components/layout/GridLayoutEditor";
import { groupEditorHeightRows } from "@/components/layout/layoutGroups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SeamlessLayoutContext } from "@/pages/Instance/EventsPanels/SeamlessLayoutContext";
import type { LayoutDraftController } from "./useLayoutDraft";

export const LAYOUT_EDITOR_ROW_HEIGHT = 96;
const LAYOUT_EDITOR_COLS = 12;
const LAYOUT_EDITOR_GRID_MARGIN = 10;
const DEFAULT_GROUP_ACCENT = "#5F8FA6";

interface LayoutEditorCanvasProps {
  controller: LayoutDraftController;
  /** Renders a panel or strip tile's content. Groups are rendered by the canvas. */
  renderTile: (item: GridEditorItem) => ReactNode;
  readOnly?: boolean;
  pulseFirstResizeHandle?: boolean;
  onResizeStop?: () => void;
}

function groupDropTargetAtEvent(event: Event): HTMLElement | null {
  if (!("clientX" in event) || !("clientY" in event)) return null;
  for (const element of document.elementsFromPoint(event.clientX as number, event.clientY as number)) {
    const target = element.closest<HTMLElement>("[data-layout-group-drop-id]");
    if (target) return target;
  }
  return null;
}

function localPositionForGroupDrop(target: HTMLElement, event: Event) {
  const rect = target.getBoundingClientRect();
  const clientX = "clientX" in event ? event.clientX as number : rect.left;
  const clientY = "clientY" in event ? event.clientY as number : rect.top;
  const columnStride = (rect.width + LAYOUT_EDITOR_GRID_MARGIN) / LAYOUT_EDITOR_COLS;
  const rowStride = LAYOUT_EDITOR_ROW_HEIGHT + LAYOUT_EDITOR_GRID_MARGIN;
  return {
    x: Math.floor((clientX - rect.left + target.scrollLeft) / columnStride),
    y: Math.floor((clientY - rect.top + target.scrollTop) / rowStride),
  };
}

/**
 * The shared drag/resize surface for a layout draft: outer grid, group rows
 * with their own nested grids, drag-into/out-of groups, and per-tile remove.
 */
export function LayoutEditorCanvas({
  controller,
  renderTile,
  readOnly = false,
  pulseFirstResizeHandle = false,
  onResizeStop,
}: LayoutEditorCanvasProps) {
  const { draft } = controller;
  const { items } = draft;
  const seamless = draft.appearance.seamless === true;
  const [activeDropGroupId, setActiveDropGroupId] = useState<string | null>(null);

  const outerLayoutItems = items
    .filter((item) => !item.groupId)
    .map((item) => {
      if (item.kind !== "group") return item;
      const requiredHeight = groupEditorHeightRows(items.filter((candidate) => candidate.groupId === item.id));
      return { ...item, h: requiredHeight, minH: requiredHeight, maxH: requiredHeight };
    });

  const handleItemDrag = (_item: GridEditorItem, event: Event) => {
    setActiveDropGroupId(groupDropTargetAtEvent(event)?.dataset.layoutGroupDropId ?? null);
  };

  const handleItemDragStop = (item: GridEditorItem, event: Event) => {
    const target = groupDropTargetAtEvent(event);
    const nextGroupId = target?.dataset.layoutGroupDropId;
    setActiveDropGroupId(null);

    if (nextGroupId && nextGroupId === item.groupId) return;

    if (target && nextGroupId && item.kind !== "group") {
      const desired = localPositionForGroupDrop(target, event);
      // Let the source grid finish its drag cleanup before moving the item into
      // another GridLayout. Synchronous cross-grid remounting leaves RGL's drag
      // transform attached to the newly mounted item.
      requestAnimationFrame(() => {
        controller.moveIntoGroup(item.id, nextGroupId, desired);
        toast.success(`${item.title} added to group`);
      });
      return;
    }

    if (item.groupId) {
      requestAnimationFrame(() => {
        controller.moveOutOfGroup(item.id);
        toast.success(`${item.title} removed from group`);
      });
    }
  };

  const renderEditableTile = (item: GridEditorItem) => (
    <div className="group relative h-full">
      {renderTile(item)}
      {!readOnly ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-20 rounded-md bg-background/20 opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="pointer-events-none absolute right-2 top-2 z-30 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="pointer-events-auto h-8 px-2"
              aria-label={`Remove ${item.title}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                controller.removeItem(item.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );

  const renderGroup = (item: GridEditorItem) => {
    const groupedItems = items.filter((candidate) => candidate.groupId === item.id);
    const isDropTarget = activeDropGroupId === item.id;
    return (
      <div
        className={cn(
          "flex h-full flex-col bg-card/40 transition-colors",
          isDropTarget && "bg-primary/10 ring-2 ring-inset ring-primary",
        )}
      >
        <div
          className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2 pl-12"
          style={{
            backgroundColor: `color-mix(in oklab, ${item.accentColor || "var(--primary)"} 14%, transparent)`,
            boxShadow: `inset 3px 0 0 ${item.accentColor || "var(--primary)"}`,
          }}
        >
          <LayoutPanelTop className="h-5 w-5 shrink-0" style={{ color: item.accentColor || "var(--primary)" }} />
          <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2">
            <Input
              aria-label="Group title"
              value={item.title}
              disabled={readOnly}
              onChange={(event) => controller.updateItem(item.id, { title: event.target.value })}
              className="h-9 bg-background/80 font-medium"
            />
            <Input
              aria-label="Group description"
              value={item.description ?? ""}
              placeholder="Description"
              disabled={readOnly}
              onChange={(event) => controller.updateItem(item.id, { description: event.target.value })}
              className="h-9 bg-background/80 text-muted-foreground"
            />
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <input
              type="color"
              aria-label="Group color"
              value={item.accentColor ?? DEFAULT_GROUP_ACCENT}
              disabled={readOnly}
              onChange={(event) => controller.updateItem(item.id, { accentColor: event.target.value })}
              className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
            />
            Color
          </label>
          {item.accentColor && !readOnly ? (
            <button
              type="button"
              className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => controller.updateItem(item.id, { accentColor: undefined })}
            >
              Reset
            </button>
          ) : null}
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={item.collapsedByDefault === true}
              disabled={readOnly}
              onChange={(event) => controller.updateItem(item.id, { collapsedByDefault: event.target.checked })}
            />
            Start collapsed
          </label>
          {!readOnly ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8 shrink-0 px-2"
              aria-label={`Remove ${item.title}`}
              onClick={() => controller.removeItem(item.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div
          data-layout-group-drop-id={item.id}
          data-layout-group-content
          className="min-h-0 flex-1 overflow-auto p-3 styled-scrollbar"
        >
          {groupedItems.length === 0 ? (
            <div className={cn(
              "flex h-full min-h-40 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground",
              isDropTarget && "border-primary text-foreground",
            )}>
              Drag panels or strips here to add them to this group.
            </div>
          ) : (
            <GridLayoutEditor
              cols={LAYOUT_EDITOR_COLS}
              rowHeight={LAYOUT_EDITOR_ROW_HEIGHT}
              items={groupedItems}
              onItemsChange={controller.mergePositions}
              showItemHeader={false}
              editable={!readOnly}
              seamless={seamless}
              onResizeStop={onResizeStop}
              preservePositions
              onItemDrag={handleItemDrag}
              onItemDragStop={handleItemDragStop}
              renderItem={renderEditableTile}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <SeamlessLayoutContext.Provider value={seamless}>
      <GridLayoutEditor
        cols={LAYOUT_EDITOR_COLS}
        rowHeight={LAYOUT_EDITOR_ROW_HEIGHT}
        items={outerLayoutItems}
        onItemsChange={controller.mergePositions}
        showItemHeader={false}
        editable={!readOnly}
        seamless={seamless}
        pulseFirstResizeHandle={pulseFirstResizeHandle}
        onResizeStop={onResizeStop}
        onItemDrag={handleItemDrag}
        onItemDragStop={handleItemDragStop}
        renderItem={(item) => (item.kind === "group" ? renderGroup(item) : renderEditableTile(item))}
      />
    </SeamlessLayoutContext.Provider>
  );
}
