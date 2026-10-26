import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";

/**
 * A meter's bars only (the Watch preset): names on class-coloured bars, no
 * columns or breakouts. Clicking a bar calls `onOpen` (e.g. the full preset).
 */
export function MeterBars({ data, onOpen, openLabel }: { data: PlayerMetricChartData[]; onOpen?: () => void; openLabel: string }) {
  const rows = [...data].sort((left, right) => right.value - left.value);
  const max = rows[0]?.value ?? 0;
  if (rows.length === 0 || max <= 0) {
    return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Nothing yet</div>;
  }
  return (
    <div className="styled-scrollbar h-full min-h-0 overflow-y-auto" data-meter-bars>
      <ul className="flex flex-col gap-px">
        {rows.map((row) => (
          <li key={row.playerID}>
            <button
              type="button"
              onClick={onOpen}
              disabled={!onOpen}
              title={onOpen ? openLabel : row.playerName}
              className="relative flex h-[18px] w-full items-center overflow-hidden rounded-sm bg-muted/40 px-1.5 text-left text-2xs font-medium text-white enabled:hover:brightness-125"
              style={{ opacity: row.dimmed ? 0.45 : 1 }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0"
                style={{ width: `${(row.value / max) * 100}%`, background: `var(--color-class-${row.className.toLowerCase()})`, opacity: 0.7 }}
              />
              <span className="relative min-w-0 truncate [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">{row.playerName}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
