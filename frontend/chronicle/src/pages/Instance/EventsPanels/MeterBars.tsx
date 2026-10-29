import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { buildMeterValuesModel, type MeterValuesOptions } from "./meterBarsModel";

const classColor = (row: PlayerMetricChartData) => `var(--color-class-${row.className.toLowerCase()})`;

/**
 * A meter's bars only (the Watch preset): names on class-coloured bars, no
 * columns or breakouts. Clicking a bar calls `onOpen` (e.g. the full preset).
 * With `values`, rows are compact (22 px) with value + share columns, row tags,
 * marker lines and "+N more" (see `MeterValuesOptions`). `onOpenRow` replaces
 * `onOpen` on the bars, with the row clicked.
 */
export function MeterBars({
  data,
  onOpen,
  onOpenRow,
  openLabel,
  values,
}: {
  data: PlayerMetricChartData[];
  onOpen?: () => void;
  onOpenRow?: (row: PlayerMetricChartData) => void;
  openLabel: string;
  values?: MeterValuesOptions;
}) {
  const rows = [...data].sort((left, right) => right.value - left.value);
  const max = rows[0]?.value ?? 0;
  if (rows.length === 0 || max <= 0) {
    return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Nothing yet</div>;
  }
  if (values) {
    return <MeterValues data={rows} onOpen={onOpen} onOpenRow={onOpenRow} openLabel={openLabel} values={values} />;
  }
  return (
    <div className="styled-scrollbar h-full min-h-0 overflow-y-auto" data-meter-bars>
      <ul className="flex flex-col gap-px">
        {rows.map((row) => (
          <li key={row.playerID}>
            <button
              type="button"
              onClick={onOpenRow ? () => onOpenRow(row) : onOpen}
              disabled={!onOpenRow && !onOpen}
              title={onOpenRow || onOpen ? openLabel : row.playerName}
              className="relative flex h-[18px] w-full items-center overflow-hidden rounded-sm bg-muted/40 px-1.5 text-left text-2xs font-medium text-white enabled:hover:brightness-125"
              style={{ opacity: row.dimmed ? 0.45 : 1 }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0"
                style={{ width: `${(row.value / max) * 100}%`, background: classColor(row), opacity: 0.7 }}
              />
              <span className="relative min-w-0 truncate [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">{row.playerName}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MeterValues({
  data,
  onOpen,
  onOpenRow,
  openLabel,
  values,
}: {
  data: PlayerMetricChartData[];
  onOpen?: () => void;
  onOpenRow?: (row: PlayerMetricChartData) => void;
  openLabel: string;
  values: MeterValuesOptions;
}) {
  const model = buildMeterValuesModel(data, values);
  return (
    <div className="flex min-h-0 flex-col gap-2" data-meter-bars data-meter-values>
      <div className="relative">
        <ul className="flex flex-col gap-px">
          {model.rows.map(({ row, widthPct, value, share, tag }) => (
            <li key={row.playerID}>
              <button
                type="button"
                onClick={onOpenRow ? () => onOpenRow(row) : onOpen}
                disabled={!onOpenRow && !onOpen}
                title={onOpenRow || onOpen ? openLabel : row.playerName}
                className="relative flex h-[22px] w-full items-center gap-2 overflow-hidden rounded-sm bg-muted/40 px-1.5 text-left text-xs font-medium tracking-wide text-white [text-shadow:0_1px_2px_rgba(0,0,0,.8)] enabled:hover:brightness-125"
                style={{ opacity: row.dimmed ? 0.45 : 1 }}
              >
                <span aria-hidden className="absolute inset-y-0 left-0" style={{ width: `${widthPct}%`, background: classColor(row), opacity: 0.7 }} />
                <span className="relative min-w-0 flex-1 truncate">{row.playerName}</span>
                {tag && (
                  <span className="relative text-[10px] uppercase tracking-[0.08em]" style={{ color: tag.color ?? "var(--muted-foreground)" }} data-meter-tag>
                    {tag.label}
                  </span>
                )}
                <span className="relative whitespace-nowrap font-mono text-[11px]">{value}</span>
                <span className="relative w-11 whitespace-nowrap text-right font-mono text-[11px] text-white/75">{share}</span>
              </button>
            </li>
          ))}
        </ul>
        {model.markers.map((marker) => (
          <span
            key={`${marker.value}-${marker.color}`}
            aria-hidden
            title={marker.label}
            className="pointer-events-none absolute inset-y-0 w-0.5 opacity-90"
            style={{ left: `${marker.leftPct}%`, background: marker.color }}
            data-meter-marker
          />
        ))}
      </div>
      {model.more > 0 && (
        onOpen ? (
          <button type="button" onClick={onOpen} title={openLabel} className="self-start text-[11px] text-muted-foreground hover:text-foreground">
            +{model.more} more
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground">+{model.more} more</span>
        )
      )}
    </div>
  );
}
