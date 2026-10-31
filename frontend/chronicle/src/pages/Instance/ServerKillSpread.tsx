import type { TimeParseSpread } from "@/api/typesGenerated";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";

/** Fastest to slowest server kill, with the median and a pull marked. Left is faster. */
export function ServerSpread({
  spread,
  valueMs,
  color = "var(--color-rose-400)",
  labels = true,
}: {
  spread: Pick<TimeParseSpread, "min_ms" | "median_ms" | "max_ms">;
  valueMs: number | null;
  color?: string;
  labels?: boolean;
}) {
  const span = Math.max(spread.max_ms - spread.min_ms, 1);
  const position = (ms: number) => `${Math.min(100, Math.max(0, ((ms - spread.min_ms) / span) * 100))}%`;
  return (
    <div className="space-y-1">
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/20" />
        <div className="absolute top-0 h-3 w-px bg-white/60" style={{ left: position(spread.median_ms) }} title="Server median" />
        {valueMs !== null && (
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-popover"
            style={{ left: position(valueMs), backgroundColor: color }}
            title={formatClearDuration(valueMs)}
          />
        )}
      </div>
      {labels && (
        <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>Fastest {formatClearDuration(spread.min_ms)}</span>
          <span>Median {formatClearDuration(spread.median_ms)}</span>
          <span>{formatClearDuration(spread.max_ms)}</span>
        </div>
      )}
    </div>
  );
}
