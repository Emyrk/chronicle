import { useState } from "react";
import { Pencil } from "lucide-react";
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";
import type { DragPayload, SlotEntry } from "./types";
import { entryName } from "./types";
import { ClassIcon } from "./ClassIcon";

interface GroupCardProps {
  gi: number;
  slots: (SlotEntry | null)[];
  note: string;
  onNoteChange: (note: string) => void;
  onSlotClick: (si: number) => void;
  onSlotDrop: (si: number) => void;
  dragRef: React.RefObject<DragPayload | null>;
}

function slotSubtitle(entry: SlotEntry): string {
  if (entry.kind === "placeholder") {
    return entry.note || "placeholder — click to set spec";
  }
  const spec = entry.spec || (CLASS_DISPLAY[entry.cls] ?? entry.cls);
  const changed = entry.spec && entry.reportedSpec && entry.spec !== entry.reportedSpec;
  return spec + (changed ? " *" : "") + (entry.note ? ` · ${entry.note}` : "");
}

/** One raid group: header with an editable note, five drag-and-drop slots. */
export function GroupCard({ gi, slots, note, onNoteChange, onSlotClick, onSlotDrop, dragRef }: GroupCardProps) {
  const [editingNote, setEditingNote] = useState(false);

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 border-b border-border min-h-7">
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
          </>
        )}
      </div>
      <div className="flex flex-col gap-1 p-1.5">
        {slots.map((entry, si) => (
          <SlotRow
            key={si}
            entry={entry}
            onClick={() => entry && onSlotClick(si)}
            onDrop={() => onSlotDrop(si)}
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
  onClick,
  onDrop,
  onDragStart,
  onDragEnd,
}: {
  entry: SlotEntry | null;
  onClick: () => void;
  onDrop: () => void;
  onDragStart?: () => void;
  onDragEnd: () => void;
}) {
  if (!entry) {
    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
        className="flex items-center gap-2 min-h-[34px] px-1.5 py-1 rounded-md border border-dashed border-border hover:border-ring transition-colors"
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
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onClick={onClick}
      className={`flex items-center gap-2 min-h-[34px] px-1.5 py-1 rounded-md bg-background/60 cursor-pointer hover:border-ring transition-colors border ${
        isPlaceholder ? "border-dashed border-border" : "border-border/60"
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
        <p className="text-[9px] text-muted-foreground leading-tight truncate">{slotSubtitle(entry)}</p>
      </div>
    </div>
  );
}
