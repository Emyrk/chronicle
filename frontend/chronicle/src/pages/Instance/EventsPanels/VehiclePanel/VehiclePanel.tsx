/**
 * Vehicle panel - timeline and diagnostics for addon-reported vehicle control.
 */
/* eslint-disable react-refresh/only-export-components */

import { useMemo } from "react";
import { CarFront, TriangleAlert } from "lucide-react";
import type {
  VehicleControlDiagnostic,
  VehicleControlInterval,
} from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { ScrollArea, ScrollBar } from "@/components/ui/ScrollArea/ScrollArea";
import {
  HintTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { vehicleProcessor, type VehicleResult } from "./vehicle.processor";
import {
  clipIntervalToRange,
  formatVehicleDuration,
  intervalOverlapsRange,
  selectedEncounterRange,
} from "./vehiclePanelLogic";

interface VehicleRow {
  guid: string;
  name: string;
  intervals: VehicleControlInterval[];
}

const DIAGNOSTIC_LABELS: Record<string, string> = {
  unmatched_release: "Release without an assignment",
  stale_release: "Release did not match the active pilot",
  duplicate_assignment: "Duplicate assignment ignored",
};

const RELEASE_LABELS: Record<string, string> = {
  explicit: "Explicit release",
  reassigned: "Closed by reassignment",
  session_boundary: "Closed at addon session boundary",
};

function shortGuid(guid: string): string {
  return guid.slice(-8);
}

function formatClock(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function VehiclePanelContent({ context }: PanelRenderProps<VehicleResult>) {
  const metadata = context.instance.vehicleControlIntervals;
  const intervals = useMemo(() => metadata?.intervals ?? [], [metadata?.intervals]);
  const diagnostics = useMemo(() => metadata?.diagnostics ?? [], [metadata?.diagnostics]);
  const range = useMemo(
    () => selectedEncounterRange(context.instance.encounters, context.selectedEncounterIds),
    [context.instance.encounters, context.selectedEncounterIds],
  );

  const visibleIntervals = useMemo(
    () => (range ? intervals.filter((interval) => intervalOverlapsRange(interval, range)) : []),
    [intervals, range],
  );

  const visibleDiagnostics = useMemo(
    () =>
      range
        ? diagnostics.filter(
            (diagnostic) =>
              diagnostic.timestamp_ms >= range.startMs && diagnostic.timestamp_ms <= range.endMs,
          )
        : [],
    [diagnostics, range],
  );

  const rows = useMemo(() => {
    const byVehicle = new Map<string, VehicleRow>();
    for (const interval of visibleIntervals) {
      let row = byVehicle.get(interval.vehicle_guid);
      if (!row) {
        row = {
          guid: interval.vehicle_guid,
          name:
            interval.vehicle_name ||
            context.instance.units?.[interval.vehicle_guid]?.name ||
            shortGuid(interval.vehicle_guid),
          intervals: [],
        };
        byVehicle.set(interval.vehicle_guid, row);
      }
      row.intervals.push(interval);
    }
    return Array.from(byVehicle.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [context.instance.units, visibleIntervals]);

  const controllerCount = useMemo(
    () => new Set(visibleIntervals.map((interval) => interval.controller_guid)).size,
    [visibleIntervals],
  );

  if (!metadata || (intervals.length === 0 && diagnostics.length === 0)) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        No vehicle control metadata is available for this instance.
        <br />
        <span className="text-muted-foreground/70">
          Vehicle data requires a companion addon version that emits vehicle assignments.
        </span>
      </div>
    );
  }

  if (!range) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        Select an encounter to inspect vehicle control.
      </div>
    );
  }

  const durationMs = Math.max(range.endMs - range.startMs, 1);

  return (
    <ScrollArea className="h-full">
      <div className="min-w-max space-y-3 p-2">
        <div className="flex min-w-[520px] flex-wrap items-center gap-2 border-b pb-2 text-[10px]">
          <SummaryPill label="Vehicles" value={rows.length} />
          <SummaryPill label="Pilots" value={controllerCount} />
          <SummaryPill label="Intervals" value={visibleIntervals.length} />
          {visibleDiagnostics.length > 0 && (
            <SummaryPill label="Diagnostics" value={visibleDiagnostics.length} warning />
          )}
          <span className="ml-auto text-muted-foreground">
            {formatVehicleDuration(durationMs)} selected
          </span>
        </div>

        {rows.length > 0 ? (
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
              <span className="w-40 shrink-0">Vehicle</span>
              <span className="min-w-[340px] flex-1">Pilot timeline</span>
            </div>
            {rows.map((row) => (
              <VehicleTimelineRow
                key={row.guid}
                row={row}
                rangeStartMs={range.startMs}
                rangeEndMs={range.endMs}
                context={context}
              />
            ))}
          </div>
        ) : (
          <div className="py-5 text-center text-xs text-muted-foreground">
            No vehicle assignments overlap the selected encounters.
          </div>
        )}

        {visibleDiagnostics.length > 0 && (
          <VehicleDiagnostics diagnostics={visibleDiagnostics} context={context} />
        )}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

function SummaryPill({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <span
      className={
        warning
          ? "rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-300"
          : "rounded border border-border/60 bg-muted/30 px-2 py-1 text-muted-foreground"
      }
    >
      {label} <strong className="ml-1 text-foreground">{value}</strong>
    </span>
  );
}

function VehicleTimelineRow({
  row,
  rangeStartMs,
  rangeEndMs,
  context,
}: {
  row: VehicleRow;
  rangeStartMs: number;
  rangeEndMs: number;
  context: PanelRenderProps<VehicleResult>["context"];
}) {
  const durationMs = Math.max(rangeEndMs - rangeStartMs, 1);
  return (
    <div className="flex items-center gap-2 border-b border-border/30 py-1.5 hover:bg-muted/20">
      <div className="w-40 shrink-0 overflow-hidden">
        <div className="truncate text-xs font-medium text-sky-300" title={`${row.name} (${row.guid})`}>
          {row.name}
        </div>
        <div className="truncate font-mono text-[9px] text-muted-foreground" title={row.guid}>
          {shortGuid(row.guid)}
        </div>
      </div>
      <div className="relative h-7 min-w-[340px] flex-1 overflow-hidden rounded bg-muted/30">
        {context.instance.encounters
          .filter((encounter) => context.selectedEncounterIds.includes(encounter.id))
          .map((encounter) => {
            const startMs = new Date(encounter.start_time).getTime();
            const endMs = new Date(encounter.end_time).getTime();
            return (
              <div
                key={encounter.id}
                className="absolute inset-y-0 border-x border-muted-foreground/20"
                style={{
                  left: `${((startMs - rangeStartMs) / durationMs) * 100}%`,
                  width: `${((endMs - startMs) / durationMs) * 100}%`,
                }}
              />
            );
          })}
        {row.intervals.map((interval) => {
          const clipped = clipIntervalToRange(interval, {
            startMs: rangeStartMs,
            endMs: rangeEndMs,
          });
          const left = ((clipped.startMs - rangeStartMs) / durationMs) * 100;
          const width = ((clipped.endMs - clipped.startMs) / durationMs) * 100;
          const player = context.instance.players?.[interval.controller_guid];
          const controllerName =
            interval.controller_name ||
            player?.name ||
            context.instance.units?.[interval.controller_guid]?.name ||
            shortGuid(interval.controller_guid);
          const color = player?.class ? getClassColorVar(player.class) : "#38bdf8";
          const actualEndMs = interval.released_at_ms ?? rangeEndMs;

          return (
            <HintTooltip
              key={`${interval.session_id ?? "unknown"}-${interval.vehicle_guid}-${interval.assigned_at_ms}-${interval.assigned_ordinal}`}
            >
              <TooltipTrigger asChild>
                <div
                  className="absolute inset-y-1 cursor-help overflow-hidden rounded-sm border border-white/20 px-1 text-[9px] font-medium leading-5 text-black/80 shadow-sm transition-[filter] hover:brightness-110"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.6)}%`,
                    backgroundColor: color,
                  }}
                >
                  <span className="whitespace-nowrap">{controllerName}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" hideArrow className="max-w-sm bg-popover text-popover-foreground">
                <div className="space-y-1 text-xs">
                  <div className="font-medium text-sky-300">{row.name}</div>
                  <div>
                    Piloted by <span className="font-medium" style={{ color }}>{controllerName}</span>
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {interval.controller_guid}
                  </div>
                  <div>
                    {formatClock(interval.assigned_at_ms)} to{" "}
                    {interval.released_at_ms ? formatClock(interval.released_at_ms) : "session end / unknown"}
                  </div>
                  <div className="font-medium">
                    Duration: {formatVehicleDuration(Math.max(actualEndMs - interval.assigned_at_ms, 0))}
                  </div>
                  {interval.release_reason && (
                    <div className="text-muted-foreground">
                      {RELEASE_LABELS[interval.release_reason] ?? interval.release_reason}
                      {interval.inferred_release ? " (inferred)" : ""}
                    </div>
                  )}
                  {interval.session_id && (
                    <div className="font-mono text-[10px] text-muted-foreground">
                      Session: {interval.session_id}
                    </div>
                  )}
                </div>
              </TooltipContent>
            </HintTooltip>
          );
        })}
      </div>
    </div>
  );
}

function VehicleDiagnostics({
  diagnostics,
  context,
}: {
  diagnostics: readonly VehicleControlDiagnostic[];
  context: PanelRenderProps<VehicleResult>["context"];
}) {
  return (
    <div className="min-w-[520px] border-t border-amber-500/20 pt-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-300">
        <TriangleAlert className="h-3.5 w-3.5" />
        Transport diagnostics
      </div>
      <div className="space-y-1">
        {diagnostics.map((diagnostic) => {
          const vehicleName =
            diagnostic.vehicle_name ||
            context.instance.units?.[diagnostic.vehicle_guid]?.name ||
            shortGuid(diagnostic.vehicle_guid);
          const controllerName =
            diagnostic.controller_name ||
            context.instance.players?.[diagnostic.controller_guid]?.name ||
            shortGuid(diagnostic.controller_guid);
          const activeControllerName = diagnostic.active_controller_guid
            ? context.instance.players?.[diagnostic.active_controller_guid]?.name ||
              shortGuid(diagnostic.active_controller_guid)
            : null;
          return (
            <div
              key={`${diagnostic.kind}-${diagnostic.timestamp_ms}-${diagnostic.ordinal}`}
              className="grid grid-cols-[76px_1fr] gap-2 rounded border border-amber-500/15 bg-amber-500/5 px-2 py-1.5 text-[10px]"
            >
              <span className="font-mono text-muted-foreground">
                {formatClock(diagnostic.timestamp_ms)}
              </span>
              <span>
                <strong className="text-amber-300">
                  {DIAGNOSTIC_LABELS[diagnostic.kind] ?? diagnostic.kind}
                </strong>
                {" · "}{vehicleName} / {controllerName}
                {activeControllerName && ` · active pilot: ${activeControllerName}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createVehiclePanel(): PanelDefinition<VehicleResult, any> {
  return {
    ...vehicleProcessor,
    label: "Vehicles",
    icon: <CarFront className="h-4 w-4" />,
    syncDataMode: "full",
    render: (props: PanelRenderProps<VehicleResult>) => <VehiclePanelContent {...props} />,
  };
}
