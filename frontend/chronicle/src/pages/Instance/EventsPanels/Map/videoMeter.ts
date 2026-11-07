import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import type { CachedStream, StreamType } from "@/hooks/instanceEvents";
import { aggregateForEncounters } from "../DamageDone/aggregateDamageDone";
import type { DamageDoneResult } from "../DamageDone/damageDone.processor";
import { processIncrementally } from "../mainThreadProcessor";
import { buildMeterValuesModel } from "../meterBarsModel";
import type { PanelContext } from "../types";
import { toSerializableContext } from "../usePanelAggregation";
import { METER_PANELS } from "./meterPanels";

/** How often (in fight time) the video's damage meter updates. */
export const VIDEO_METER_STEP_MS = 500;
/** Rows drawn in the video's meter. */
export const VIDEO_METER_ROWS = 8;
// Per-second values divide by at least this, so the first hits don't read as huge DPS.
const MIN_ELAPSED_MS = 1000;

export interface VideoMeterSnapshot {
  rows: PlayerMetricChartData[];
  /** Fight time the rows cover. */
  elapsedMs: number;
}

/**
 * The map's Damage Done meter (same panel, processor and filters as the live
 * meter window) through the fight: one pass over its events, snapshotting the
 * meter every VIDEO_METER_STEP_MS. Returns a lookup from an absolute replay
 * time to the latest snapshot at or before it.
 */
export async function createVideoDamageMeter(
  context: PanelContext,
  fetchStream: (type: StreamType) => Promise<CachedStream>,
  encounterStartMs: number,
  encounterEndMs: number,
): Promise<(ms: number) => VideoMeterSnapshot> {
  const { panel } = METER_PANELS.damage_done;
  const types = [...new Set<StreamType>([...panel.streams, "unit_classification"])];
  const fetched = await Promise.all(types.map((type) => fetchStream(type)));
  const streams = new Map(types.map((type, index) => [type, fetched[index]]));
  const defaultFilters = panel.defaultFilters ?? [];
  // As the live meter (useEmbeddedPanel): fixed + default filters, with the
  // time range controller passing everything through.
  const filters = [...(panel.fixedFilters ?? []), ...defaultFilters].map((filter) =>
    filter.type === "time_range" && filter.value === "controller" ? { ...filter, value: "" } : filter);
  const serializable = { ...toSerializableContext(context, null, { filters: defaultFilters }), filters };

  const lastStep = Math.max(0, Math.floor((encounterEndMs - encounterStartMs) / VIDEO_METER_STEP_MS));
  const snapshots: VideoMeterSnapshot[] = [];
  const record = (state: DamageDoneResult) => snapshots.push({
    rows: aggregateForEncounters("players", state, context.selectedEncounterIds, context.entitySelection),
    elapsedMs: snapshots.length * VIDEO_METER_STEP_MS,
  });
  const response = await processIncrementally<DamageDoneResult>({
    panelId: panel.id,
    streams,
    context: serializable,
    contextKey: "video-meter",
    stopAtTimestamp: new Date(encounterEndMs),
    previousState: null,
    // Step k holds the events up to start + k steps, as the live meter shows with the cursor there.
    beforeEvent: (eventTimeMs, state) => {
      while (snapshots.length <= lastStep && eventTimeMs > encounterStartMs + snapshots.length * VIDEO_METER_STEP_MS) record(state);
    },
  });
  if (response.error) throw new Error(response.error);
  while (snapshots.length <= lastStep) record(response.result);

  return (ms) => snapshots[Math.min(lastStep, Math.max(0, Math.floor((ms - encounterStartMs) / VIDEO_METER_STEP_MS)))];
}

const classColors = new Map<string, string>();
function classColor(className: string): string {
  const key = className.toLowerCase();
  let color = classColors.get(key);
  if (color === undefined) {
    color = getComputedStyle(document.documentElement).getPropertyValue(`--color-class-${key}`).trim() || "#9ca3af";
    classColors.set(key, color);
  }
  return color;
}

let fonts: { sans: string; mono: string } | null = null;
function meterFonts(): { sans: string; mono: string } {
  if (!fonts) {
    const style = getComputedStyle(document.documentElement);
    fonts = {
      sans: style.getPropertyValue("--font-sans").trim() || "sans-serif",
      mono: style.getPropertyValue("--font-mono").trim() || "monospace",
    };
  }
  return fonts;
}

/**
 * Draws the meter into a video frame, bottom-left (the watermark has the
 * bottom-right): the live meter window's look (class-coloured bars, DPS and
 * share columns), sized to the frame height. Draws nothing until someone has
 * done damage.
 */
export function drawVideoMeter(context: CanvasRenderingContext2D, width: number, height: number, snapshot: VideoMeterSnapshot): void {
  const seconds = Math.max(snapshot.elapsedMs, MIN_ELAPSED_MS) / 1000;
  const model = buildMeterValuesModel(snapshot.rows, {
    limit: VIDEO_METER_ROWS,
    formatValue: (value) => `${Math.round(value / seconds).toLocaleString("en-US")}/s`,
  });
  if (model.rows.length === 0 || model.rows[0].row.value <= 0) return;

  const u = height / 1080;
  const { sans, mono } = meterFonts();
  const margin = 32 * u;
  const panelWidth = Math.min(440 * u, width - 2 * margin);
  const titleHeight = 40 * u;
  const rowHeight = 34 * u;
  const gap = 2 * u;
  const pad = 4 * u;
  const panelHeight = titleHeight + pad * 2 + model.rows.length * (rowHeight + gap) - gap;
  const left = margin;
  const top = height - margin - panelHeight;
  const radius = 4 * u;

  // Window and title bar.
  context.fillStyle = "rgba(0, 0, 0, 0.75)";
  context.beginPath();
  context.roundRect(left, top, panelWidth, panelHeight, radius);
  context.fill();
  context.fillStyle = "rgba(255, 255, 255, 0.06)";
  context.fillRect(left, top, panelWidth, titleHeight);
  context.fillStyle = "rgba(255, 255, 255, 0.1)";
  context.fillRect(left, top + titleHeight - u, panelWidth, u);
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.font = `600 ${22 * u}px ${sans}`;
  context.fillText("Damage Done", left + 12 * u, top + titleHeight / 2);

  const shareWidth = 72 * u;
  const rowLeft = left + pad;
  const rowWidth = panelWidth - pad * 2;
  model.rows.forEach(({ row, widthPct, value, share }, index) => {
    const y = top + titleHeight + pad + index * (rowHeight + gap);
    const middle = y + rowHeight / 2;
    context.globalAlpha = row.dimmed ? 0.45 : 1;
    context.fillStyle = "rgba(255, 255, 255, 0.06)";
    context.fillRect(rowLeft, y, rowWidth, rowHeight);
    context.save();
    context.globalAlpha *= 0.7;
    context.fillStyle = classColor(row.className);
    context.fillRect(rowLeft, y, (rowWidth * widthPct) / 100, rowHeight);
    context.restore();

    context.shadowColor = "rgba(0, 0, 0, 0.8)";
    context.shadowOffsetY = u;
    context.shadowBlur = 2 * u;
    const shareRight = rowLeft + rowWidth - 8 * u;
    context.textAlign = "right";
    context.font = `${19 * u}px ${mono}`;
    context.fillStyle = "rgba(255, 255, 255, 0.75)";
    context.fillText(share, shareRight, middle);
    const valueRight = shareRight - shareWidth;
    context.fillStyle = "#ffffff";
    context.fillText(value, valueRight, middle);
    const valueLeft = valueRight - context.measureText(value).width - 12 * u;

    // The name, clipped short of the value column.
    context.textAlign = "left";
    context.font = `500 ${20 * u}px ${sans}`;
    context.save();
    context.beginPath();
    context.rect(rowLeft, y, Math.max(0, valueLeft - rowLeft), rowHeight);
    context.clip();
    context.fillText(`${index + 1}. ${row.playerName}`, rowLeft + 8 * u, middle);
    context.restore();
    context.shadowColor = "transparent";
    context.globalAlpha = 1;
  });
}
