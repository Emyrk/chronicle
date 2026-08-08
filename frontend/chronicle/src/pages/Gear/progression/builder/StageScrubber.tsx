import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MAX_STAGES, type GearStage } from "@/pages/Gear/builder/gearListModel";

export interface StageStop {
  stage: GearStage;
  /** Average equipped item level for this stage, or null when unknown. */
  averageItemLevel: number | null;
  filledSlots: number;
}

interface StageScrubberProps {
  stops: readonly StageStop[];
  stageIndex: number;
  onSelect: (index: number) => void;
  /** Present in edit mode: enables add/rename/remove/reorder. */
  onAdd?: () => void;
  onRename?: (index: number, name: string) => void;
  onRemove?: (index: number) => void;
  onMove?: (from: number, to: number) => void;
}

/**
 * The max-level axis: a discrete scrubber whose stops are the
 * progression's stage snapshots, each labelled with its computed average
 * item level. Stages rather than a continuous ilevel slider because at
 * cap upgrades arrive in tiers, ilevel ties are everywhere, and sets are
 * situational — the ilevel labels keep the "scrub along gear level" feel.
 */
export function StageScrubber({
  stops,
  stageIndex,
  onSelect,
  onAdd,
  onRename,
  onRemove,
  onMove,
}: StageScrubberProps) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const editable = !!onAdd;
  const active = stops[stageIndex];

  const commitRename = () => {
    if (renaming != null && draftName.trim()) onRename?.(renaming, draftName.trim());
    setRenaming(null);
  };

  if (stops.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
        No max-level stages yet.
        {editable && (
          <>
            {" "}
            <button type="button" className="text-blue-400 hover:underline" onClick={onAdd}>
              Add the first one
            </button>{" "}
            or snapshot the pool at cap.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* The rail: one stop per stage, connected left to right. */}
      <div className="flex items-stretch">
        {stops.map((stop, i) => {
          const isActive = i === stageIndex;
          return (
            <div key={i} className="relative flex min-w-0 flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <span
                  className={cn("h-px flex-1", i === 0 ? "bg-transparent" : "bg-zinc-700")}
                />
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-current={isActive ? "step" : undefined}
                  title={stop.stage.name || `Stage ${i + 1}`}
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors",
                    isActive
                      ? "border-blue-400 bg-blue-500"
                      : "border-zinc-600 bg-zinc-900 hover:border-zinc-400",
                  )}
                />
                <span
                  className={cn(
                    "h-px flex-1",
                    i === stops.length - 1 ? "bg-transparent" : "bg-zinc-700",
                  )}
                />
              </div>
              <button
                type="button"
                onClick={() => onSelect(i)}
                className="mt-1.5 min-w-0 max-w-full px-1 text-center"
              >
                <div
                  className={cn(
                    "truncate text-xs",
                    isActive ? "text-white" : "text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {stop.stage.name || `Stage ${i + 1}`}
                </div>
                <div className="font-mono text-2xs text-zinc-500">
                  {stop.averageItemLevel != null
                    ? `ilvl ${stop.averageItemLevel.toFixed(1)}`
                    : "ilvl —"}
                </div>
              </button>
            </div>
          );
        })}
        {editable && stops.length < MAX_STAGES && (
          <div className="flex flex-col items-center justify-start pl-2">
            <div className="flex h-3.5 items-center">
              <button
                type="button"
                title="Add stage"
                aria-label="Add stage"
                onClick={() => {
                  onAdd?.();
                  onSelect(stops.length);
                }}
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-dashed border-zinc-600 text-zinc-500 hover:border-zinc-400 hover:text-zinc-300"
              >
                <Plus className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-2">
          {renaming === stageIndex ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                commitRename();
              }}
            >
              <Input
                className="h-8 w-40 text-sm"
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
          ) : (
            <h3 className="font-wow text-base text-amber-100/90">
              {active.stage.name || `Stage ${stageIndex + 1}`}
            </h3>
          )}
          <span className="text-xs text-zinc-500">
            <span className="font-mono text-zinc-300">{active.filledSlots}</span> filled
          </span>
          <div className="flex-1" />
          {editable && (
            <div className="flex items-center gap-0.5 text-zinc-500">
              <IconButton
                label="Rename stage"
                onClick={() => {
                  setRenaming(stageIndex);
                  setDraftName(active.stage.name);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Move stage earlier"
                disabled={stageIndex === 0}
                onClick={() => {
                  onMove?.(stageIndex, stageIndex - 1);
                  onSelect(stageIndex - 1);
                }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Move stage later"
                disabled={stageIndex === stops.length - 1}
                onClick={() => {
                  onMove?.(stageIndex, stageIndex + 1);
                  onSelect(stageIndex + 1);
                }}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Remove stage"
                danger
                onClick={() => {
                  const name = active.stage.name || `Stage ${stageIndex + 1}`;
                  if (!window.confirm(`Remove stage "${name}"?`)) return;
                  onRemove?.(stageIndex);
                  onSelect(Math.max(0, stageIndex - 1));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "p-1 transition-colors disabled:opacity-30",
        danger ? "hover:text-red-400" : "hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}
