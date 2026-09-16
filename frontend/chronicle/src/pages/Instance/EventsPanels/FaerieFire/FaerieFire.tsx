/* eslint-disable react-refresh/only-export-components */
import { useCallback, useMemo } from "react";
import { Leaf } from "lucide-react";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { cn } from "@/lib/utils";
import { GenericPanel } from "../GenericPanel";
import type { PanelDefinition, PanelRenderProps } from "../types";
import {
  calculateFaerieFireUptime,
  faerieFireProcessor,
  type DruidFaerieFireStats,
  type FaerieFireDebugEvent,
  type FaerieFireResult,
  type TargetFaerieFireStats,
} from "./faerieFire.processor";

function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  }
  return `${seconds}.${millis.toString().padStart(3, "0")}s`;
}

function formatPercent(percent: number): string {
  return `${percent >= 99.95 ? "100" : percent.toFixed(1)}%`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createFaerieFirePanel(): PanelDefinition<FaerieFireResult, any> {
  return {
    ...faerieFireProcessor,
    label: "Faerie Fire",
    icon: <Leaf className="h-4 w-4" />,
    supportsPerSecond: false,
    checkboxLabel: "Show targets",
    render: (props) => <FaerieFireContent {...props} />,
  };
}

function FaerieFireContent(props: PanelRenderProps<FaerieFireResult>) {
  const {
    result,
    checkboxChecked: showTargets,
    context,
    durationMs,
    panelOption,
    setPanelOption,
  } = props;
  const selectedTargetGuid = useMemo(() => panelOption
    ?.split(",")
    .map((token) => token.trim())
    .find((token) => token.startsWith("target:"))
    ?.slice("target:".length) ?? null, [panelOption]);

  const setSelectedTargetGuid = useCallback((guid: string | null) => {
    if (!setPanelOption) return;
    const tokens = showTargets ? ["cb"] : [];
    if (guid) tokens.push(`target:${guid}`);
    setPanelOption(tokens.length > 0 ? tokens.join(",") : null);
  }, [setPanelOption, showTargets]);

  const druids = result
    ? Object.values(result.druids).sort((a, b) =>
        (b.applications + b.refreshes + b.failures)
        - (a.applications + a.refreshes + a.failures))
    : [];
  const targetActiveFromOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    for (const encounter of context.instance.encounters) {
      const encounterStartMs = new Date(encounter.start_time).getTime();
      for (const enemy of encounter.enemies ?? []) {
        const firstStart = enemy.periods
          .map((period) => period.start?.timestamp)
          .filter((timestamp): timestamp is string => Boolean(timestamp))
          .map((timestamp) => new Date(timestamp).getTime() - encounterStartMs)
          .filter((offset) => Number.isFinite(offset) && offset >= 0)
          .sort((a, b) => a - b)[0];
        if (firstStart !== undefined) {
          offsets.set(`${encounter.id}:${enemy.id}`, firstStart);
        }
      }
    }
    return offsets;
  }, [context.instance.encounters]);

  const targets = result
    ? Object.values(result.targets).sort((a, b) => {
        if (a.firstApplicationMs === null) return 1;
        if (b.firstApplicationMs === null) return -1;
        return a.firstApplicationMs - b.firstApplicationMs;
      })
    : [];

  return (
    <GenericPanel {...props}>
      {druids.length === 0 ? (
        <div className="py-2 text-center text-sm text-muted-foreground">
          No Faerie Fire casts found
        </div>
      ) : showTargets ? (
        <TargetsView
          targets={targets}
          encounterDurations={new Map(context.instance.encounters.map((encounter) => [
            encounter.id,
            Math.max(0, new Date(encounter.end_time).getTime() - new Date(encounter.start_time).getTime()),
          ]))}
          targetActiveFromOffsets={targetActiveFromOffsets}
          fallbackDurationMs={durationMs}
          selectedTargetGuid={selectedTargetGuid}
          onSelectTargetGuid={setSelectedTargetGuid}
        />
      ) : (
        <DruidsView druids={druids} />
      )}
    </GenericPanel>
  );
}

function DruidsView({ druids }: { druids: DruidFaerieFireStats[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-medium">Druid</th>
              <th className="px-2 py-1.5 text-right font-medium">
                <span className="cursor-help" title="Applied while Faerie Fire was not active">Applied</span>
              </th>
              <th className="px-2 py-1.5 text-right font-medium">
                <span className="cursor-help" title="Recast while Faerie Fire was already active">Refresh</span>
              </th>
              <th className="px-2 py-1.5 text-right font-medium">
                <span className="cursor-help" title="Missed or resisted casts">Failed</span>
              </th>
              <th className="px-2 py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {druids.map((druid) => (
              <tr key={druid.guid} className="border-b border-border/10 hover:bg-muted/50">
                <td className="px-2 py-1 font-medium text-[var(--color-class-druid)]">{druid.name}</td>
                <td className="px-2 py-1 text-right font-mono text-green-400">{druid.applications}</td>
                <td className="px-2 py-1 text-right font-mono text-yellow-400">{druid.refreshes}</td>
                <td className="px-2 py-1 text-right font-mono text-red-400">{druid.failures}</td>
                <td className="px-2 py-1 text-right font-mono">
                  {druid.applications + druid.refreshes + druid.failures}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

interface TargetsViewProps {
  targets: TargetFaerieFireStats[];
  encounterDurations: Map<string, number>;
  targetActiveFromOffsets: Map<string, number>;
  fallbackDurationMs: number;
  selectedTargetGuid: string | null;
  onSelectTargetGuid: (guid: string | null) => void;
}

function TargetsView({
  targets,
  encounterDurations,
  targetActiveFromOffsets,
  fallbackDurationMs,
  selectedTargetGuid,
  onSelectTargetGuid,
}: TargetsViewProps) {
  const selectedTarget = selectedTargetGuid
    ? targets.find((target) => target.guid === selectedTargetGuid)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-faerie-fire-targets>
      <div className="shrink-0 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{targets.length}</span> targets had Faerie Fire applied
        {selectedTarget && (
          <button
            type="button"
            onClick={() => onSelectTargetGuid(null)}
            className="ml-2 cursor-pointer text-blue-400 hover:text-blue-300"
          >
            [clear selection]
          </button>
        )}
      </div>

      {selectedTarget ? (
        <DebugBreakout
          target={selectedTarget}
          encounterDurationMs={encounterDurations.get(selectedTarget.encounterId) ?? fallbackDurationMs}
          targetActiveFromMs={targetActiveFromOffsets.get(`${selectedTarget.encounterId}:${selectedTarget.guid}`) ?? 0}
          onClose={() => onSelectTargetGuid(null)}
        />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">Target</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">First applied</th>
                <th className="px-2 py-1.5 text-left font-medium">Applied by</th>
                <th className="px-2 py-1.5 text-right font-medium">Uptime</th>
                <th className="px-2 py-1.5 text-right font-medium">Refreshes</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => {
                const uptime = calculateFaerieFireUptime(
                  target,
                  encounterDurations.get(target.encounterId) ?? fallbackDurationMs,
                  targetActiveFromOffsets.get(`${target.encounterId}:${target.guid}`) ?? 0,
                );
                return (
                  <tr
                    key={target.guid}
                    className="cursor-pointer border-b border-border/10 hover:bg-muted/50"
                    onClick={() => onSelectTargetGuid(target.guid)}
                  >
                    <td className="px-2 py-1 font-medium text-orange-400 whitespace-nowrap">{target.name}</td>
                    <td className="px-2 py-1 text-right font-mono text-2xs whitespace-nowrap">
                      {target.firstApplicationMs === null ? "—" : formatTimeMs(target.firstApplicationMs)}
                    </td>
                    <td className="px-2 py-1 text-[var(--color-class-druid)] whitespace-nowrap">
                      {target.firstCasterName ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-green-400">
                      {formatPercent(uptime.percent)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">{target.refreshes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}

function DebugBreakout({
  target,
  encounterDurationMs,
  targetActiveFromMs,
  onClose,
}: {
  target: TargetFaerieFireStats;
  encounterDurationMs: number;
  targetActiveFromMs: number;
  onClose: () => void;
}) {
  const events = [...target.debugEvents].sort((a, b) => a.offsetMs - b.offsetMs);
  const uptime = calculateFaerieFireUptime(target, encounterDurationMs, targetActiveFromMs);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between">
        <span className="text-xs font-medium text-orange-400">{target.name}</span>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
        >
          ✕ close
        </button>
      </div>

      <div className="shrink-0 text-2xs text-muted-foreground">
        First applied: <span className="font-medium text-foreground">
          {target.firstApplicationMs !== null ? formatTimeMs(target.firstApplicationMs) : "never"}
        </span>
        {" • "}
        Uptime: <span className="font-medium text-green-400" title={`${formatTimeMs(uptime.uptimeMs)} of ${formatTimeMs(uptime.eligibleMs)} eligible`}>
          {formatPercent(uptime.percent)}
        </span>
        {" • "}
        Total events: <span className="font-medium text-foreground">{events.length}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1" data-faerie-fire-debug-scroll>
        <table className="w-full text-2xs font-mono">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-2 py-1 text-right font-medium">Offset</th>
              <th className="px-2 py-1 text-left font-medium">Type</th>
              <th className="px-2 py-1 text-left font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event: FaerieFireDebugEvent, index: number) => (
              <tr
                key={index}
                data-faerie-fire-debug-row
                className={cn(
                  "border-b border-border/10",
                  event.type === "applied" && "bg-green-500/5",
                  event.type === "refreshed" && "bg-yellow-500/5",
                  event.type === "failed" && "bg-red-500/5 opacity-50",
                  event.type === "removed" && "opacity-50",
                )}
              >
                <td className="px-2 py-0.5 text-right font-mono">
                  {formatTimeMs(event.offsetMs)}
                </td>
                <td className={cn(
                  "px-2 py-0.5",
                  event.type === "applied" && "text-green-400",
                  event.type === "refreshed" && "text-yellow-400",
                  event.type === "failed" && "text-red-400",
                  event.type === "removed" && "text-muted-foreground",
                )}>
                  {event.type}
                </td>
                <td className="px-2 py-0.5">
                  <span className="text-[var(--color-class-druid)]">{event.casterName}</span>
                  {event.abilityName && (
                    <span className="ml-2 text-muted-foreground">via {event.abilityName}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
