import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Database, Loader2, Search } from "lucide-react";
import type { InstanceRankingRecord } from "@/api/typesGenerated";
import type { ProcessorEvent } from "../processorTypes";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { rankingRecordsProcessor, type RankingRecordsResult } from "./rankingRecords.processor";
import { filterRankingRecords } from "./rankingRecordsFilter";

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

// eslint-disable-next-line react-refresh/only-export-components
export function createRankingRecordsPanel(): PanelDefinition<RankingRecordsResult, ProcessorEvent> {
  return {
    ...rankingRecordsProcessor,
    label: "Ranking Records",
    icon: <Database className="h-4 w-4" />,
    supportsPerSecond: false,
    selfManagesAggregation: true,
    syncDataMode: "full",
    render: (props: PanelRenderProps<RankingRecordsResult>) => <RankingRecordsContent {...props} />,
  };
}

export function RankingRecordsContent({ context }: PanelRenderProps<RankingRecordsResult>) {
  const instanceID = context.instance.id;
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
  });

  const records = query.data ?? [];
  const filteredRecords = useMemo(
    () => filterRankingRecords(query.data ?? [], search),
    [query.data, search],
  );

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
        <table className="w-full min-w-[980px] border-collapse tabular-nums">
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
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record) => (
              <tr key={record.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                <td className="whitespace-nowrap px-2 py-1.5 font-medium">{record.encounter_name}</td>
                <td className="px-2 py-1.5">
                  <div className="font-medium">{record.player_name}</div>
                  <div className="text-[10px] text-muted-foreground">{record.player_class}</div>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                  {[record.player_spec, record.player_role].filter(Boolean).join(" · ") || "—"}
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
    </div>
  );
}
