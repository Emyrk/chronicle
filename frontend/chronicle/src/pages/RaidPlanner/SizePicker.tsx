import { GROUP_SIZE, MAX_GROUPS, SIZE_PRESETS } from "./types";

interface SizePickerProps {
  pending: number;
  onPendingChange: (groups: number) => void;
  onConfirm: () => void;
  /** Shown when a board already exists so the user can back out unchanged. */
  onCancel?: () => void;
}

/** Raid-size panel: pick a group count (1 group = 5 players) or a common preset. */
export function SizePicker({ pending, onPendingChange, onConfirm, onCancel }: SizePickerProps) {
  return (
    <div className="flex gap-4 items-start">
      <div className="w-[340px] max-w-full border border-border rounded-lg bg-popover shadow-lg p-3.5">
        <p className="text-xs font-semibold text-foreground">Raid size</p>
        <p className="text-[10.5px] text-muted-foreground mt-0.5">
          One group is {GROUP_SIZE} players. Presets cover the common lockouts.
        </p>
        <div className="flex gap-1 mt-2.5">
          {Array.from({ length: MAX_GROUPS }, (_, i) => i + 1).map((n) => {
            const selected = n === pending;
            return (
              <button
                key={n}
                onClick={() => onPendingChange(n)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md border transition-colors ${
                  selected
                    ? "border-ring bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-ring"
                }`}
              >
                <span className="font-mono text-xs font-semibold">{n}</span>
                <span className="text-[8.5px] opacity-80">{n * GROUP_SIZE}p</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {SIZE_PRESETS.map((preset) => {
            const selected = preset.groups === pending;
            return (
              <button
                key={preset.groups}
                onClick={() => onPendingChange(preset.groups)}
                className={`px-2.5 py-0.5 rounded-full text-[10.5px] whitespace-nowrap transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:border-ring"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border">
          <span className="flex-1 text-[10.5px] text-muted-foreground">
            Shrinking later moves overflow groups to the bench.
          </span>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-2.5 py-1 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-[11.5px] font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Set {pending} {pending === 1 ? "group" : "groups"}
          </button>
        </div>
      </div>
      <p className="max-w-[300px] pt-1 text-[11px] leading-relaxed text-muted-foreground">
        The board rescales to the chosen count. Groups that no longer exist send their members to the
        bench; nothing is lost.
      </p>
    </div>
  );
}
