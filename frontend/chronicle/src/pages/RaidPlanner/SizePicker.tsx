import { Minus, Plus } from "lucide-react";
import { GROUP_SIZE, MAX_GROUPS } from "./types";

/** Quick-pick raid sizes, in players. */
const QUICK_SIZES = [10, 25, 40];

interface SizePickerProps {
  pending: number;
  onPendingChange: (groups: number) => void;
  onConfirm: () => void;
  /** Shown when a board already exists so the user can back out unchanged. */
  onCancel?: () => void;
}

/**
 * Centered raid-size wizard: a group-count stepper with quick-size links and
 * a live preview of the groups, per design 6f.
 */
export function SizePicker({ pending, onPendingChange, onConfirm, onCancel }: SizePickerProps) {
  return (
    <div className="flex justify-center py-12">
      <div className="w-[360px] max-w-full border border-border rounded-xl bg-popover shadow-xl px-7 py-6">
        <h2 className="text-[17px] font-semibold text-foreground text-center">How many groups?</h2>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-[18px] mt-4">
          <button
            aria-label="Fewer groups"
            disabled={pending <= 1}
            onClick={() => onPendingChange(Math.max(1, pending - 1))}
            className="h-[34px] w-[34px] rounded-full border border-border flex items-center justify-center text-primary hover:border-ring disabled:opacity-30 disabled:hover:border-border transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="w-24 text-center">
            <div className="font-mono text-[34px] leading-none font-semibold text-foreground">
              {pending}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {pending * GROUP_SIZE} players
            </div>
          </div>
          <button
            aria-label="More groups"
            disabled={pending >= MAX_GROUPS}
            onClick={() => onPendingChange(Math.min(MAX_GROUPS, pending + 1))}
            className="h-[34px] w-[34px] rounded-full border border-border flex items-center justify-center text-primary hover:border-ring disabled:opacity-30 disabled:hover:border-border transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Quick sizes */}
        <div className="flex justify-center gap-1.5 mt-3.5">
          {QUICK_SIZES.map((players) => {
            const groups = players / GROUP_SIZE;
            const selected = groups === pending;
            return (
              <button
                key={players}
                onClick={() => onPendingChange(groups)}
                className={`px-3 py-1 rounded-full text-[10.5px] transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:border-ring hover:text-foreground"
                }`}
              >
                {players}
              </button>
            );
          })}
        </div>

        {/* Group preview */}
        <div className="flex justify-center gap-1 mt-3.5">
          {Array.from({ length: pending }, (_, i) => (
            <span key={i} className="w-[26px] h-[34px] rounded bg-primary/20 border border-ring" />
          ))}
        </div>

        <button
          onClick={onConfirm}
          className="block w-full mt-[18px] py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
        >
          Build {pending * GROUP_SIZE}-man raid
        </button>
        {onCancel && (
          <div className="flex flex-col items-center gap-1 mt-3">
            <button
              onClick={onCancel}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel — keep current board
            </button>
            <span className="text-[10px] text-muted-foreground/70">
              Shrinking moves overflow groups to the bench.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
