import { useTimeParseSpreads } from "@/api/rankingsQueries";
import { cn } from "@/lib/utils";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import { ParseScopeList } from "./EncounterKillParse";
import type { ScopedParses } from "./Overview/encounterKillTimePopulation";
import type { Encounter, Instance } from "./InstancePage";

const KILL_TYPE_LABEL: Record<Encounter["kill_type"], string> = {
  clean: "Kill",
  partial: "Kill",
  wipe: "Wipe",
  reset: "Reset",
};

/** The pull's ranked length: the ranking window when there is one, else the whole pull. */
function pullDurationMs(encounter: Encounter): number {
  if (encounter.ranking_window) return encounter.ranking_window.end_offset_ms - encounter.ranking_window.start_offset_ms;
  return Date.parse(encounter.end_time) - Date.parse(encounter.start_time);
}

/**
 * The entity menu card for a boss pull: how long it took, where that sits among the server's
 * kills of the boss, and its kill-time parse against the server, realm and guild.
 */
export function EncounterKillReference({
  encounter,
  instance,
  parses,
  lookbackDays,
}: {
  encounter: Encounter;
  instance: Pick<Instance, "name" | "difficultyName" | "maxPlayers">;
  parses: ScopedParses | undefined;
  lookbackDays: number | undefined;
}) {
  const spreads = useTimeParseSpreads(instance.name);
  const sameBoss = (spreads.data?.spreads ?? []).filter(
    (spread) => spread.kind === "boss_kill" && spread.encounter_name === encounter.name,
  );
  const spread =
    sameBoss.find((item) => item.difficulty_name === instance.difficultyName && item.max_players === instance.maxPlayers) ?? sameBoss[0];
  const killed = encounter.kill_type === "clean" || encounter.kill_type === "partial";
  const durationMs = parses?.server?.duration_ms ?? pullDurationMs(encounter);

  return (
    <div className="text-xs">
      <div className="flex items-baseline gap-2 px-3 pt-2.5">
        <span className={cn("font-medium", killed ? "text-emerald-400" : "text-rose-400")}>{KILL_TYPE_LABEL[encounter.kill_type]}</span>
        <span className="text-muted-foreground">{killed ? "in" : "after"}</span>
        <span className="ml-auto font-mono text-base font-bold tabular-nums">{formatClearDuration(durationMs)}</span>
      </div>
      {spread && spread.sample_size > 0 && (
        <ServerSpread minMs={spread.min_ms} medianMs={spread.median_ms} maxMs={spread.max_ms} valueMs={killed ? durationMs : null} />
      )}
      {spread && spread.sample_size > 0 && (
        <p className="px-3 pb-2 text-[10px] text-muted-foreground">
          Server · {spread.sample_size} kills{spreads.data?.lookback_days ? ` in ${spreads.data.lookback_days} days` : ""}
        </p>
      )}
      {killed ? (
        <ParseScopeList title="Kill time parse" unit="kills" parses={parses} lookbackDays={lookbackDays} />
      ) : (
        <p className="px-3 pb-2.5 text-[11px] text-muted-foreground">Only kills are ranked.</p>
      )}
    </div>
  );
}

/** Fastest to slowest server kill, with the median and this pull marked. Left is faster. */
function ServerSpread({ minMs, medianMs, maxMs, valueMs }: { minMs: number; medianMs: number; maxMs: number; valueMs: number | null }) {
  const span = Math.max(maxMs - minMs, 1);
  const position = (ms: number) => `${Math.min(100, Math.max(0, ((ms - minMs) / span) * 100))}%`;
  return (
    <div className="space-y-1 px-3 pt-2">
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/20" />
        <div className="absolute top-0 h-3 w-px bg-white/60" style={{ left: position(medianMs) }} title="Server median" />
        {valueMs !== null && (
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-popover bg-rose-400"
            style={{ left: position(valueMs) }}
            title="This pull"
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>Fastest {formatClearDuration(minMs)}</span>
        <span>Median {formatClearDuration(medianMs)}</span>
        <span>{formatClearDuration(maxMs)}</span>
      </div>
    </div>
  );
}
