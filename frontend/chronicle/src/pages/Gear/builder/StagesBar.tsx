import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MAX_STAGES, type GearPayload } from "./gearListModel";

interface StagesBarProps {
  payload: GearPayload;
  stageIndex: number;
  onSelect: (i: number) => void;
  /** Present in edit mode: enables add/rename/remove/reorder. */
  onAdd?: () => void;
  onRename?: (i: number, name: string) => void;
  onRemove?: (i: number) => void;
  onMove?: (from: number, to: number) => void;
}

/**
 * Stage tabs. In edit mode the active tab exposes rename, reorder, and
 * remove controls, plus an add-stage button (which copies the previous
 * stage so progression lists stay explicit per stage).
 */
export function StagesBar({ payload, stageIndex, onSelect, onAdd, onRename, onRemove, onMove }: StagesBarProps) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const editable = !!onAdd;
  const count = payload.stages.length;

  if (count <= 1 && !editable) return null;

  const commitRename = () => {
    if (renaming != null && draftName.trim()) onRename?.(renaming, draftName.trim());
    setRenaming(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {payload.stages.map((s, i) => {
        const active = i === stageIndex;
        if (renaming === i) {
          return (
            <form
              key={i}
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                commitRename();
              }}
            >
              <Input
                className="h-8 w-36 text-sm"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={64}
                autoFocus
                onBlur={commitRename}
              />
              <button type="submit" className="text-zinc-400 hover:text-zinc-200">
                <Check className="h-4 w-4" />
              </button>
            </form>
          );
        }
        return (
          <div
            key={i}
            className={cn(
              "flex items-center rounded border transition-colors",
              active
                ? "border-blue-500 bg-blue-500/10 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
            )}
          >
            <button type="button" onClick={() => onSelect(i)} className="px-3 py-1.5 text-sm">
              {s.name || `Stage ${i + 1}`}
            </button>
            {editable && active && (
              <div className="flex items-center gap-0.5 pr-1.5 text-zinc-500">
                <button
                  type="button"
                  title="Rename stage"
                  className="hover:text-zinc-200 p-0.5"
                  onClick={() => {
                    setRenaming(i);
                    setDraftName(s.name);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Move stage left"
                  className="hover:text-zinc-200 p-0.5 disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => {
                    onMove?.(i, i - 1);
                    onSelect(i - 1);
                  }}
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Move stage right"
                  className="hover:text-zinc-200 p-0.5 disabled:opacity-30"
                  disabled={i === count - 1}
                  onClick={() => {
                    onMove?.(i, i + 1);
                    onSelect(i + 1);
                  }}
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Remove stage"
                  className="hover:text-red-400 p-0.5"
                  onClick={() => {
                    const name = s.name || `Stage ${i + 1}`;
                    if (!window.confirm(`Remove stage "${name}"?`)) return;
                    onRemove?.(i);
                    onSelect(Math.max(0, i - 1));
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        );
      })}
      {editable && count < MAX_STAGES && (
        <button
          type="button"
          onClick={() => {
            onAdd?.();
            onSelect(count);
          }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-dashed border-zinc-700 text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add stage
        </button>
      )}
    </div>
  );
}
