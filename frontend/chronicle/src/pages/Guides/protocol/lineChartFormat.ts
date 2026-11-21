/** Value formats Lua can pick by name; Nivo's own format functions cannot cross the worker boundary. */
import type { LineChartFormat } from "../widgets/lineChart";

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function formatChartValue(value: number, format: LineChartFormat): string {
  switch (format) {
    case "compact": {
      const size = Math.abs(value);
      if (size >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
      if (size >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (size >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
      return numberFormat.format(Math.round(value * 10) / 10);
    }
    case "seconds": return `${numberFormat.format(Math.round(value * 10) / 10)}s`;
    case "duration": {
      const total = Math.max(0, Math.round(value));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = String(total % 60).padStart(2, "0");
      return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
    }
    case "percent": return `${numberFormat.format(Math.round(value * 10) / 10)}%`;
    default: return numberFormat.format(value);
  }
}
