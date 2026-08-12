import { Users } from "lucide-react";
import { GROUP_SIZE, MAX_GROUPS, SIZE_PRESETS } from "./types";

interface SizePickerProps {
  pending: number;
  onPendingChange: (groups: number) => void;
  onConfirm: () => void;
  /** Shown when a board already exists so the user can back out unchanged. */
  onCancel?: () => void;
}

/**
 * Centered raid-size wizard: pick a group count (1 group = 5 players) or a
 * common preset, then confirm to build the board.
 */
export function SizePicker({ pending, onPendingChange, onConfirm, onCancel }: SizePickerProps) {
  return (
    <div className="flex justify-center py-12">
      <div className="w-full max-w-2xl border border-border rounded-xl bg-popover shadow-xl p-7">
        <div className="flex flex-col items-center text-center">
          <span className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/15 mb-3">
            <Users className="h-6 w-6 text-primary" />
          </span>
          <h2 className="text-lg font-semibold text-foreground">How big is your raid?</h2>
          <p className="text-xs text-muted-foreground mt-1">
            One group is {GROUP_SIZE} players. Pick a group count, or jump straight to a common
            lockout — you can resize later without losing anyone.
          </p>
        </div>

        <div className="flex gap-1.5 mt-6">
          {Array.from({ length: MAX_GROUPS }, (_, i) => i + 1).map((n) => {
            const selected = n === pending;
            return (
              <button
                key={n}
                onClick={() => onPendingChange(n)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border transition-colors ${
                  selected
                    ? "border-ring bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-ring hover:text-foreground"
                }`}
              >
                <span className="font-mono text-base font-semibold">{n}</span>
                <span className="text-[10px] opacity-80">{n * GROUP_SIZE} players</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {SIZE_PRESETS.map((preset) => {
            const selected = preset.groups === pending;
            return (
              <button
                key={preset.groups}
                onClick={() => onPendingChange(preset.groups)}
                className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:border-ring hover:text-foreground"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mt-7 pt-5 border-t border-border">
          <span className="flex-1 text-[11px] text-muted-foreground">
            Shrinking later moves overflow groups to the bench — nothing is lost.
          </span>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-3.5 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Build {pending * GROUP_SIZE}-man raid
          </button>
        </div>
      </div>
    </div>
  );
}
