import { useAdminInvalidatePerformance } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { difficultyLabel } from "@/lib/wowUtils";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, Database, Loader2, Search } from "lucide-react";
import type { InstanceRankingRecord } from "@/api/typesGenerated";
import type { ProcessorEvent } from "../processorTypes";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { shouldLoadPublicRankingData } from "../panelAvailability";
import { rankingRecordsProcessor, type RankingRecordsResult } from "./rankingRecords.processor";
import { filterRankingRecords } from "./rankingRecordsFilter";
import { instanceEntityAttributes } from "@/components/ui/PlayerMetricChart/instanceEntity";

// eslint-disable-next-line react-refresh/only-export-components
export function canInvalidatePerformanceRecord(
  record: InstanceRankingRecord,
  canInvalidateRankings: boolean | undefined,
  logGroupId: string | undefined,
): boolean {
  return Boolean(canInvalidateRankings && logGroupId && record.encounter_id);
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

// eslint-disable-next-line react-refresh/only-export-components
export function createRankingRecordsPanel(): PanelDefinition<RankingRecordsResult, ProcessorEvent> {
  return {
    ...rankingRecordsProcessor,
    label: "Ranking Records",
    icon: <Database className="h-4 w-4" />,
    keybinds: [],
    supportsPerSecond: false,
    selfManagesAggregation: true,
    syncDataMode: "full",
    render: (props: PanelRenderProps<RankingRecordsResult>) => <RankingRecordsContent {...props} />,
  };
}

export function RankingRecordsContent({ context }: PanelRenderProps<RankingRecordsResult>) {
  const instanceID = context.instance.id;
  const unlisted = context.instance.unlisted;
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["instance-ranking-records", instanceID],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/raidlogs/instances/${encodeURIComponent(instanceID)}/ranking-records`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch ranking records (${response.status})`);
      }
      return response.json() as Promise<InstanceRankingRecord[]>;
    },
    staleTime: Infinity,
    retry: false,
    enabled: shouldLoadPublicRankingData(unlisted),
  });

  const [recordToInvalidate, setRecordToInvalidate] = useState<InstanceRankingRecord | null>(null);
  const [invalidReason, setInvalidReason] = useState("");
  const invalidatePerformance = useAdminInvalidatePerformance();

  const handleInvalidatePerformance = async () => {
    const reason = invalidReason.trim();
    const logGroupId = context.instance.logGroupId;
    if (!recordToInvalidate || !logGroupId || !reason) return;

    try {
      await invalidatePerformance.mutateAsync({
        logGroupId,
        instanceId: instanceID,
        rankingId: recordToInvalidate.id,
        reason,
      });
      toast.success("Player performance invalidated", {
        description: `${recordToInvalidate.player_name} on ${recordToInvalidate.encounter_name} no longer contributes to rankings or parses.`,
      });
      setRecordToInvalidate(null);
      setInvalidReason("");
    } catch (error) {
      toast.error("Failed to invalidate player performance", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const records = query.data ?? [];
  const filteredRecords = useMemo(
    () => filterRankingRecords(query.data ?? [], search),
    [query.data, search],
  );

  if (unlisted) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No ranking records are available for unlisted instances.
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading recorded rankings…
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-red-400">
        <AlertTriangle className="h-4 w-4" />
        {query.error.message}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No DPS or HPS ranking rows were recorded for this instance.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground">
          Raw database values · {filteredRecords.length} of {records.length} rows · zero values included
        </div>
        <label className="relative min-w-44 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find player or encounter"
            className="h-7 w-full rounded border border-border bg-background pl-7 pr-2 text-xs outline-none focus:border-primary"
          />
        </label>
      </div>

      <div className="styled-scrollbar min-h-0 flex-1 overflow-auto rounded border border-border">
        <table className="w-full min-w-[1100px] border-collapse tabular-nums">
          <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 font-medium">Encounter</th>
              <th className="px-2 py-1.5 font-medium">Player</th>
              <th className="px-2 py-1.5 font-medium">Spec / Role</th>
              <th className="px-2 py-1.5 text-right font-medium">Duration</th>
              <th className="px-2 py-1.5 text-right font-medium">Damage</th>
              <th className="px-2 py-1.5 text-right font-medium">DPS</th>
              <th className="px-2 py-1.5 text-right font-medium">Healing</th>
              <th className="px-2 py-1.5 text-right font-medium">Absorb</th>
              <th className="px-2 py-1.5 text-right font-medium">HPS</th>
              <th className="px-2 py-1.5 text-right font-medium">Deaths</th>
              {context.canInvalidateRankings && <th className="px-2 py-1.5 text-right font-medium">Actions</th>}
              <th className="px-2 py-1.5 text-right font-medium">Alive %</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record) => (
              <tr key={record.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                <td className="whitespace-nowrap px-2 py-1.5 font-medium">{record.encounter_name}<span className="ml-2 text-muted-foreground">{difficultyLabel(record.difficulty)}</span></td>
                <td className="px-2 py-1.5">
                  <div className="font-medium" {...instanceEntityAttributes(context.instance, record.player_guid)}>{record.player_name}</div>
                  <div className="text-[10px] text-muted-foreground">{record.player_class}</div>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                  {[
                    record.player_sub_spec
                      ? `${record.player_spec} (${record.player_sub_spec})`
                      : record.player_spec,
                    record.player_role,
                  ].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-2 py-1.5 text-right">{formatNumber(record.duration_secs, 2)}s</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(record.damage_done)}</td>
                <td className={record.dps === 0 ? "px-2 py-1.5 text-right text-amber-400" : "px-2 py-1.5 text-right"}>
                  {formatNumber(record.dps, 2)}
                </td>
                <td className="px-2 py-1.5 text-right">{formatNumber(record.healing_done)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(record.absorbed_done)}</td>
                <td className={record.hps === 0 ? "px-2 py-1.5 text-right text-amber-400" : "px-2 py-1.5 text-right"}>
                  {formatNumber(record.hps, 2)}
                </td>
                <td className={record.player_deaths && record.player_deaths > 0 ? "px-2 py-1.5 text-right font-semibold text-red-400" : "px-2 py-1.5 text-right text-muted-foreground"}>
                  {record.player_deaths ?? "—"}
                </td>
                {context.canInvalidateRankings && (
                  <td className="px-2 py-1.5 text-right">
                    {canInvalidatePerformanceRecord(record, context.canInvalidateRankings, context.instance.logGroupId) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-destructive hover:text-destructive"
                        onClick={() => setRecordToInvalidate(record)}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Invalidate
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                <td className="px-2 py-1.5 text-right text-muted-foreground">
                  {record.alive_percentage === undefined ? "—" : `${record.alive_percentage.toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRecords.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No ranking rows match “{search}”.
          </div>
        )}
      </div>
      <Dialog
        open={recordToInvalidate !== null}
        onOpenChange={(open) => {
          if (invalidatePerformance.isPending) return;
          if (!open) {
            setRecordToInvalidate(null);
            setInvalidReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invalidate this player performance?</DialogTitle>
            <DialogDescription>
              The encounter remains valid. Only this player&apos;s stored performance is removed from parses and rankings. A later reparse can recreate it from the source log.
            </DialogDescription>
          </DialogHeader>
          {recordToInvalidate && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="font-medium">{recordToInvalidate.player_name}</span>
              <span className="text-muted-foreground"> on {recordToInvalidate.encounter_name}</span>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">{recordToInvalidate.player_guid}</div>
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="invalidate-performance-reason" className="text-sm font-medium">Reason</label>
            <Input
              id="invalidate-performance-reason"
              value={invalidReason}
              onChange={(event) => setInvalidReason(event.target.value)}
              placeholder="Describe why this performance is invalid"
              disabled={invalidatePerformance.isPending}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRecordToInvalidate(null);
                setInvalidReason("");
              }}
              disabled={invalidatePerformance.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleInvalidatePerformance()}
              disabled={invalidatePerformance.isPending || invalidReason.trim() === ""}
            >
              {invalidatePerformance.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Invalidate performance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
