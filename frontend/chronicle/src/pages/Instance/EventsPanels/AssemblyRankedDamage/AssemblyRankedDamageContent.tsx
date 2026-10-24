import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { InstanceRankingRecord } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import type { PanelRenderProps } from "../types";
import { shouldLoadPublicRankingData } from "../panelAvailability";
import {
  rankedDamageForEncounter,
  type AssemblyRankedDamageResult,
} from "./assemblyRankedDamage.processor";

const ASSEMBLY_ENCOUNTER_NAME = "Assembly of Iron";

interface ValidationRow {
  encounterID: string;
  encounterName: string;
  playerID: string;
  playerName: string;
  playerClass: string;
  computed: number;
  recorded: number | null;
}

export function AssemblyRankedDamageContent({
  result,
  context,
  loading,
  processing,
  error,
}: PanelRenderProps<AssemblyRankedDamageResult>) {
  const assemblyEncounters = useMemo(() => {
    const selected = new Set(context.selectedEncounterIds);
    return context.instance.encounters.filter(
      (encounter) => selected.has(encounter.id) && encounter.name === ASSEMBLY_ENCOUNTER_NAME,
    );
  }, [context.instance.encounters, context.selectedEncounterIds]);

  const rankingQuery = useQuery({
    queryKey: ["instance-ranking-records", context.instance.id],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/raidlogs/instances/${encodeURIComponent(context.instance.id)}/ranking-records`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch ranking records (${response.status})`);
      }
      return response.json() as Promise<InstanceRankingRecord[]>;
    },
    staleTime: Infinity,
    retry: false,
    enabled: assemblyEncounters.length > 0 && shouldLoadPublicRankingData(context.instance.unlisted),
  });

  const rows = useMemo<ValidationRow[]>(() => {
    const recordsByEncounter = new Map<string, Map<string, InstanceRankingRecord>>();
    for (const record of rankingQuery.data ?? []) {
      if (!record.encounter_id) continue;
      const encounterRecords = recordsByEncounter.get(record.encounter_id) ?? new Map();
      encounterRecords.set(record.player_guid, record);
      recordsByEncounter.set(record.encounter_id, encounterRecords);
    }

    const validationRows: ValidationRow[] = [];
    for (const encounter of assemblyEncounters) {
      const computed = rankedDamageForEncounter(result, encounter.id);
      const records = recordsByEncounter.get(encounter.id) ?? new Map<string, InstanceRankingRecord>();
      const playerIDs = new Set([...computed.keys(), ...records.keys()]);

      for (const playerID of playerIDs) {
        const player = context.instance.players?.[playerID];
        const record = records.get(playerID);
        validationRows.push({
          encounterID: encounter.id,
          encounterName: encounter.name,
          playerID,
          playerName: player?.name ?? record?.player_name ?? playerID,
          playerClass: player?.class ?? record?.player_class ?? "UNKNOWN",
          computed: computed.get(playerID) ?? 0,
          recorded: record?.damage_done ?? null,
        });
      }
    }

    return validationRows.sort((a, b) =>
      a.encounterID.localeCompare(b.encounterID)
      || b.computed - a.computed
      || a.playerName.localeCompare(b.playerName),
    );
  }, [assemblyEncounters, context.instance.players, rankingQuery.data, result]);

  if (!context.instance.flavor?.includes("wrath")) {
    return (
      <PanelMessage title="Wrath-only mechanic">
        This panel is available for Wrath logs because it implements Assembly of Iron ranking rules.
      </PanelMessage>
    );
  }

  if (assemblyEncounters.length === 0) {
    return (
      <PanelMessage title="Select Assembly of Iron">
        This panel counts damage to the council member killed in each phase and excludes damage healed by surviving members. Select an Assembly of Iron encounter to use it.
      </PanelMessage>
    );
  }

  if (loading || processing) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Calculating ranked damage…
      </div>
    );
  }

  if (error) {
    return <PanelMessage title="Unable to calculate ranked damage">{error.message}</PanelMessage>;
  }

  const canValidate = rankingQuery.isSuccess;
  const matches = canValidate
    ? rows.filter((row) => row.recorded !== null && row.computed === row.recorded).length
    : 0;
  const mismatches = canValidate
    ? rows.filter((row) => row.recorded !== null && row.computed !== row.recorded).length
    : 0;
  const missing = canValidate ? rows.filter((row) => row.recorded === null).length : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
        <span>{rows.length} player rows</span>
        {canValidate && (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> {matches} match
          </span>
        )}
        {mismatches > 0 && (
          <span className="inline-flex items-center gap-1 text-red-400">
            <XCircle className="h-3.5 w-3.5" /> {mismatches} mismatch
          </span>
        )}
        {missing > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> {missing} without a ranking record
          </span>
        )}
      </div>

      {context.instance.unlisted && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-200">
          Ranking records are unavailable for unlisted instances. Computed values are shown without validation.
        </div>
      )}
      {rankingQuery.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading ranking records…
        </div>
      )}
      {rankingQuery.error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-red-300">
          {rankingQuery.error.message}
        </div>
      )}

      <div className="styled-scrollbar min-h-0 flex-1 overflow-auto rounded border border-border">
        <table className="w-full min-w-[680px] border-collapse tabular-nums">
          <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 font-medium">Encounter</th>
              <th className="px-2 py-1.5 font-medium">Player</th>
              <th className="px-2 py-1.5 text-right font-medium">Computed</th>
              <th className="px-2 py-1.5 text-right font-medium">Ranking record</th>
              <th className="px-2 py-1.5 text-right font-medium">Difference</th>
              <th className="px-2 py-1.5 text-center font-medium">Validation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const difference = row.recorded === null ? null : row.computed - row.recorded;
              const matchesRecord = difference === 0;
              return (
                <tr key={`${row.encounterID}:${row.playerID}`} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                    {row.encounterName}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{row.playerName}</div>
                    <div className="text-[10px] text-muted-foreground">{row.playerClass}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right">{row.computed.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right">
                    {row.recorded === null ? "—" : row.recorded.toLocaleString()}
                  </td>
                  <td className={cn(
                    "px-2 py-1.5 text-right",
                    difference !== null && difference !== 0 && "text-red-400",
                  )}>
                    {difference === null ? "—" : difference.toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {row.recorded === null ? (
                      <span className="text-amber-400">No record</span>
                    ) : matchesRecord ? (
                      <span className="text-emerald-400">Match</span>
                    ) : (
                      <span className="text-red-400">Mismatch</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && !rankingQuery.isLoading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No player damage was found for the selected Assembly encounter.
          </div>
        )}
      </div>
    </div>
  );
}

function PanelMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-2">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
