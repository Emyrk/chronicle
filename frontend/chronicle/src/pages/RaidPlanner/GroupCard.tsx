import { useState } from "react";
import { Armchair, Pencil, X } from "lucide-react";
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";
import type { DragPayload, HoverTarget, SlotEntry } from "./types";
import { entryName } from "./types";
import { ClassIcon } from "./ClassIcon";

interface GroupCardProps {
  gi: number;
  slots: (SlotEntry | null)[];
  note: string;
  onNoteChange: (note: string) => void;
  onSlotClick: (si: number) => void;
  onSlotDrop: (si: number) => void;
  onSlotBench: (si: number) => void;
  onSlotRemove: (si: number) => void;
  /** A multi-selection drag is hovering this slot — preview its landing slots. */
  onSlotMultiOver: (si: number) => void;
  /** Slots ("gi:si") a hovered multi-drag would land in. */
  previewSlots: ReadonlySet<string>;
  onClearGroup: () => void;
  onBenchGroup: () => void;
  dragRef: React.RefObject<DragPayload | null>;
  hoverRef: React.RefObject<HoverTarget | null>;
}

function slotSubtitle(entry: SlotEntry): string {
  if (entry.kind === "placeholder") {
    return entry.note;
  }
  const spec = entry.spec || (CLASS_DISPLAY[entry.cls] ?? entry.cls);
  const changed = entry.spec && entry.reportedSpec && entry.spec !== entry.reportedSpec;
  return spec + (changed ? " *" : "") + (entry.note ? ` · ${entry.note}` : "");
}

/** One raid group: header with an editable note, five drag-and-drop slots. */
export function GroupCard({
  gi,
  slots,
  note,
  onNoteChange,
  onSlotClick,
  onSlotDrop,
  onSlotBench,
  onSlotRemove,
  onSlotMultiOver,
  previewSlots,
  onClearGroup,
  onBenchGroup,
  dragRef,
  hoverRef,
}: GroupCardProps) {
  const [editingNote, setEditingNote] = useState(false);
  const hasEntries = slots.some(Boolean);

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="group/head flex items-center gap-1.5 px-2 py-1 bg-muted/40 border-b border-border min-h-7">
        <span className="text-[11px] font-semibold text-foreground/90 whitespace-nowrap">
          Group {gi + 1}
        </span>
        {editingNote ? (
          <input
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            onBlur={() => setEditingNote(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditingNote(false);
            }}
            placeholder="note…"
            autoFocus
            className="flex-1 min-w-0 px-1.5 py-px border border-ring rounded bg-background text-[10px] text-foreground focus:outline-none"
          />
        ) : (
          <>
            {note && (
              <span className="text-[10px] text-muted-foreground truncate" title={note}>
                {note}
              </span>
            )}
            <button
              onClick={() => setEditingNote(true)}
              title="Edit group note"
              className="shrink-0 text-primary opacity-40 hover:opacity-100 transition-opacity"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
            {hasEntries && (
              <span className="ml-auto flex items-center gap-1 shrink-0">
                <button
                  onClick={onBenchGroup}
                  title="Bench everyone in this group"
                  className="text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  <Armchair className="h-3 w-3" />
                </button>
                <button
                  onClick={onClearGroup}
                  title="Clear this group (players return to the roster)"
                  className="text-muted-foreground/50 hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-1 p-1.5">
        {slots.map((entry, si) => (
          <SlotRow
            key={si}
            entry={entry}
            dragRef={dragRef}
            preview={previewSlots.has(`${gi}:${si}`)}
            onClick={() => entry && onSlotClick(si)}
            onDrop={() => onSlotDrop(si)}
            onMultiOver={() => onSlotMultiOver(si)}
            onBench={() => onSlotBench(si)}
            onRemove={() => onSlotRemove(si)}
            onHover={(hovering) => {
              if (hovering) hoverRef.current = { area: "board", gi, si };
              else if (
                hoverRef.current?.area === "board" &&
                hoverRef.current.gi === gi &&
                hoverRef.current.si === si
              ) {
                hoverRef.current = null;
              }
            }}
            onDragStart={
              entry
                ? () => {
                    dragRef.current = { kind: "slot", from: { area: "board", gi, si } };
                  }
                : undefined
            }
            onDragEnd={() => {
              dragRef.current = null;
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SlotRow({
  entry,
  dragRef,
  preview,
  onClick,
  onDrop,
  onMultiOver,
  onBench,
  onRemove,
  onHover,
  onDragStart,
  onDragEnd,
}: {
  entry: SlotEntry | null;
  dragRef: React.RefObject<DragPayload | null>;
  preview: boolean;
  onClick: () => void;
  onDrop: () => void;
  onMultiOver: () => void;
  onBench: () => void;
  onRemove: () => void;
  onHover: (hovering: boolean) => void;
  onDragStart?: () => void;
  onDragEnd: () => void;
}) {
  const [localDropTarget, setLocalDropTarget] = useState(false);
  const dropTarget = localDropTarget || preview;

  // Fresh entries (roster players / class placeholders) only land on empty
  // slots; drags of already-placed entries can land anywhere (swap).
  const acceptsCurrentDrag = () => {
    const drag = dragRef.current;
    if (!drag) return false;
    return !entry || drag.kind === "slot";
  };

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsCurrentDrag()) return;
      e.preventDefault();
      // Multi-drags preview every landing slot via the page; single drags
      // highlight just this slot.
      if (dragRef.current?.kind === "roster-multi") onMultiOver();
      else setLocalDropTarget(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setLocalDropTarget(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setLocalDropTarget(false);
      onDrop();
    },
  };

  if (!entry) {
    return (
      <div
        {...dropProps}
        className={`flex items-center gap-2 min-h-[34px] px-1.5 py-1 rounded-md border border-dashed transition-colors ${
          dropTarget ? "border-ring bg-primary/15" : "border-border hover:border-ring"
        }`}
      >
        <span className="flex items-center justify-center h-[18px] w-[18px] rounded bg-muted/60 text-muted-foreground text-xs shrink-0">
          +
        </span>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground leading-tight">Empty slot</p>
          <p className="text-[9px] text-muted-foreground/60 leading-tight">drop a class or player</p>
        </div>
      </div>
    );
  }

  const isPlaceholder = entry.kind === "placeholder";
  const color = CLASS_CSS_VAR[entry.cls] ?? CLASS_CSS_VAR.UNKNOWN;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      {...dropProps}
      onClick={onClick}
      onMouseDown={(e) => {
        // Stop middle-click autoscroll.
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        onBench();
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`group/slot flex items-center gap-2 min-h-[34px] px-1.5 py-1 rounded-md cursor-pointer transition-colors border ${
        dropTarget
          ? "border-ring bg-primary/15"
          : `bg-background/60 hover:border-ring ${isPlaceholder ? "border-dashed border-border" : "border-border/60"}`
      }`}
    >
      {isPlaceholder ? (
        <span
          className="flex items-center justify-center h-[18px] w-[18px] rounded text-[10px] font-bold shrink-0"
          style={{ backgroundColor: color, color: "#1b1b1b" }}
        >
          ?
        </span>
      ) : (
        <ClassIcon cls={entry.cls} className="h-[18px] w-[18px] rounded border border-border/60 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium leading-tight truncate" style={{ color }}>
          {entryName(entry)}
        </p>
        {slotSubtitle(entry) && (
          <p className="text-[9px] text-muted-foreground leading-tight truncate">
            {slotSubtitle(entry)}
          </p>
        )}
      </div>
      <div className="hidden group-hover/slot:flex items-center gap-0.5 shrink-0">
        <button
          title="Send to bench (B)"
          onClick={(e) => {
            e.stopPropagation();
            onBench();
          }}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Armchair className="h-3 w-3" />
        </button>
        <button
          title="Remove (Del)"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-muted/60 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
