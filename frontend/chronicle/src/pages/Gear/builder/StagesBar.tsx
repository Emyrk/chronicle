import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { MAX_STAGES, type GearPayload } from "./gearListModel";

export interface StageProgressIndicator {
  covered: number;
  total: number;
  fromStage: number;
  fromLaterStages: ReadonlyArray<{ stageName: string; count: number }>;
  open: number;
}

interface StagesBarProps {
  payload: GearPayload;
  stageIndex: number;
  onSelect: (i: number) => void;
  /**
   * Optional second line per tab, indexed by stage (e.g. the stage's
   * average equipped item level in the progression view).
   */
  subLabels?: readonly (string | undefined)[];
  /** Optional character-progress indicator shown beneath each stage label. */
  indicators?: readonly (StageProgressIndicator | undefined)[];
  /** Present in edit mode: enables add/rename/remove/reorder. */
  onAdd?: () => void;
  onRename?: (i: number, name: string) => void;
  onRemove?: (i: number) => void;
  onMove?: (from: number, to: number) => void;
}

function StageTabButton({
  name,
  subLabel,
  indicator,
  onClick,
}: {
  name: string;
  subLabel?: string;
  indicator?: StageProgressIndicator;
  onClick: () => void;
}) {
  const complete =
    !!indicator && indicator.total > 0 && indicator.covered === indicator.total;
  const currentWidth = indicator?.total
    ? (indicator.fromStage / indicator.total) * 100
    : 0;
  const laterWidth = indicator?.total
    ? ((indicator.covered - indicator.fromStage) / indicator.total) * 100
    : 0;

  const button = (
    <button
      type="button"
      onClick={onClick}
      className="relative min-w-28 px-3 py-2 text-left text-sm"
    >
      <span className="flex items-center gap-1.5 leading-tight">
        <span className="truncate font-medium">{name}</span>
        {complete && (
          <Check
            className="h-3 w-3 shrink-0 text-emerald-400"
            aria-label="Stage cleared"
          />
        )}
      </span>
      {(subLabel || indicator) && (
        <span className="mt-1 block font-mono text-2xs leading-tight text-zinc-500">
          {indicator && `${indicator.covered}/${indicator.total}`}
          {indicator && subLabel && " · "}
          {subLabel}
        </span>
      )}
      {indicator && indicator.total > 0 && (
        <span
          className="absolute inset-x-0 bottom-0 flex h-0.5 overflow-hidden bg-zinc-800"
          aria-hidden
        >
          <span
            className={cn(
              "h-full transition-[width]",
              complete ? "bg-emerald-500/50" : "bg-amber-300/80",
            )}
            style={{ width: `${complete ? 100 : currentWidth}%` }}
          />
          {!complete && (
            <span
              className="h-full bg-emerald-500/70 transition-[width]"
              style={{ width: `${laterWidth}%` }}
            />
          )}
        </span>
      )}
    </button>
  );

  if (!indicator || indicator.total === 0) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        sideOffset={7}
        hideArrow
        className="w-64 border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-300 shadow-xl"
      >
        <div className="space-y-1.5">
          <p className="font-medium text-zinc-100">
            {complete
              ? "Stage cleared"
              : `${indicator.covered} of ${indicator.total} targets covered`}
          </p>
          {indicator.fromStage > 0 && (
            <p className="flex items-center gap-2">
              <span
                className={cn(
                  "h-0.5 w-2.5",
                  complete ? "bg-emerald-500/50" : "bg-amber-300/80",
                )}
              />
              {indicator.fromStage} from this stage
            </p>
          )}
          {indicator.fromLaterStages.map((later) => (
            <p key={later.stageName} className="flex items-center gap-2">
              <span className="h-0.5 w-2.5 bg-emerald-500/70" />
              {later.count} already covered by {later.stageName}
            </p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Stage tabs. In edit mode the active tab exposes rename, reorder, and
 * remove controls, plus an add-stage button. The document model decides
 * whether a new stage starts empty or copies prior values.
 */
export function StagesBar({
  payload,
  stageIndex,
  onSelect,
  subLabels,
  indicators,
  onAdd,
  onRename,
  onRemove,
  onMove,
}: StagesBarProps) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const editable = !!onAdd;
  const count = payload.stages.length;

  if (count <= 1 && !editable) return null;

  const commitRename = () => {
    if (renaming != null && draftName.trim())
      onRename?.(renaming, draftName.trim());
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
              <button
                type="submit"
                className="text-zinc-400 hover:text-zinc-200"
              >
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
            <StageTabButton
              name={s.name || `Stage ${i + 1}`}
              subLabel={subLabels?.[i]}
              indicator={indicators?.[i]}
              onClick={() => onSelect(i)}
            />
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
