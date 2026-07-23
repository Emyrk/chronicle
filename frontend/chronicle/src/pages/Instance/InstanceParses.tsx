import { useMemo } from "react";
import { Loader2, AlertTriangle, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { useInstanceParses } from "@/api/rankingsQueries";
import type {
  InstanceParsePlayer,
  InstanceParseBoss,
} from "@/api/typesGenerated";
import { cn } from "@/lib/utils";

// WCL-standard parse colors
function parseColor(score: number): string {
  if (score >= 100) return "text-amber-400"; // gold
  if (score >= 99) return "text-pink-400"; // pink
  if (score >= 95) return "text-orange-400"; // orange
  if (score >= 75) return "text-purple-400"; // purple
  if (score >= 50) return "text-blue-400"; // blue
  if (score >= 25) return "text-green-400"; // green
  return "text-zinc-400"; // grey
}

function parseBgColor(score: number): string {
  if (score >= 100) return "bg-amber-400/10";
  if (score >= 99) return "bg-pink-400/10";
  if (score >= 95) return "bg-orange-400/10";
  if (score >= 75) return "bg-purple-400/10";
  if (score >= 50) return "bg-blue-400/10";
  if (score >= 25) return "bg-green-400/10";
  return "bg-zinc-400/10";
}

function ParseScoreBadge({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn("font-mono font-bold tabular-nums", parseColor(score), className)}>
      {score}
    </span>
  );
}

function BossScoreCell({ boss }: { boss: InstanceParseBoss }) {
  if (boss.status === "sample_too_small") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-zinc-500">—</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Sample too small ({boss.sample_size} players)</p>
            <p className="text-xs text-zinc-400">Need at least 5 for scoring</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const isLowConfidence = boss.status === "low_confidence";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex items-center gap-1", parseBgColor(boss.display_score), "rounded px-1")}>
            <ParseScoreBadge score={boss.display_score} className="text-sm" />
            {isLowConfidence && (
              <AlertTriangle className="h-3 w-3 text-yellow-500" />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{boss.encounter_name}</p>
          <p className="text-xs">
            Score: {boss.precise_score.toFixed(1)} · Rank {boss.rank}/{boss.sample_size}
          </p>
          <p className="text-xs text-zinc-400">
            {boss.metric_value.toFixed(1)} · {boss.sample_size} players in cohort
          </p>
          {isLowConfidence && (
            <p className="text-xs text-yellow-400">Low confidence (small sample)</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PlayerParseRow({
  player,
  encounterNames,
  singleBoss,
}: {
  player: InstanceParsePlayer;
  encounterNames: readonly string[];
  singleBoss: boolean;
}) {
  const bossMap = useMemo(() => {
    const map = new Map<string, InstanceParseBoss>();
    for (const b of player.bosses) {
      map.set(b.encounter_name, b);
    }
    return map;
  }, [player.bosses]);

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/50">
      <td className="px-2 py-1.5 text-sm font-medium whitespace-nowrap">
        {player.player_name}
      </td>
      <td className="px-2 py-1.5 text-xs text-zinc-400 whitespace-nowrap">
        {player.player_class}
        {player.player_spec && player.player_spec !== "unknown" && (
          <span className="ml-1 text-zinc-500">({player.player_spec})</span>
        )}
      </td>
      {singleBoss ? (
        // Single boss: show the score for that boss
        (() => {
          const boss = bossMap.get(encounterNames[0]);
          if (!boss) return <td className="px-2 py-1.5 text-xs text-zinc-500">—</td>;
          return (
            <td className="px-2 py-1.5 text-center">
              <BossScoreCell boss={boss} />
            </td>
          );
        })()
      ) : (
        // Multiple bosses: show Average Parse with coverage + breakdown
        <td className="px-2 py-1.5">
          {player.status === "unknown_spec" ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                    <Info className="h-3 w-3" /> Unknown spec
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{player.reason}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : player.average_parse ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1.5">
                    <ParseScoreBadge score={player.average_parse.display_score} className="text-sm" />
                    <span className="text-2xs text-zinc-500">
                      avg · {player.average_parse.killed}/{player.average_parse.selected}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium mb-1">Per-boss breakdown</p>
                  <div className="space-y-0.5">
                    {encounterNames.map((enc) => {
                      const b = bossMap.get(enc);
                      if (!b) return (
                        <div key={enc} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-zinc-400">{enc}</span>
                          <span className="text-zinc-500">—</span>
                        </div>
                      );
                      return (
                        <div key={enc} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-zinc-300">{enc}</span>
                          <span className={cn("font-mono", parseColor(b.display_score))}>
                            {b.display_score}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-xs text-zinc-500">—</span>
          )}
        </td>
      )}
      {/* Single boss: show metric value */}
      {singleBoss && (
        <td className="px-2 py-1.5 text-xs text-zinc-400 text-right tabular-nums">
          {(() => {
            const boss = bossMap.get(encounterNames[0]);
            return boss ? boss.metric_value.toFixed(1) : "—";
          })()}
        </td>
      )}
      {/* Single boss: show sample size */}
      {singleBoss && (
        <td className="px-2 py-1.5 text-xs text-zinc-500 text-right tabular-nums">
          {(() => {
            const boss = bossMap.get(encounterNames[0]);
            return boss ? boss.sample_size : "—";
          })()}
        </td>
      )}
    </tr>
  );
}

interface InstanceParsesProps {
  instanceId: string;
  selectedEncounterNames: string[];
  metric?: "dps" | "hps";
}

export function InstanceParses({ instanceId, selectedEncounterNames, metric = "dps" }: InstanceParsesProps) {
  const { data, isLoading, error } = useInstanceParses({
    instanceId,
    encounterNames: selectedEncounterNames,
    metric,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400 py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading parses…
      </div>
    );
  }

  if (error) {
    return null; // Silently hide on error
  }

  if (!data?.available) {
    return (
      <div className="text-xs text-zinc-500 py-2">
        Parse scores are not yet available for this instance.
      </div>
    );
  }

  if (data.players.length === 0) {
    return null;
  }

  const singleBoss = data.selected_encounters.length === 1;

  // Sort players by average parse score (highest first), then by name
  const sortedPlayers = [...data.players].sort((a, b) => {
    const aScore = a.average_parse?.precise_score ?? -1;
    const bScore = b.average_parse?.precise_score ?? -1;
    if (aScore !== bScore) return bScore - aScore;
    return a.player_name.localeCompare(b.player_name);
  });

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-300">
          Parse Scores
          <span className="ml-1.5 text-2xs text-zinc-500 font-normal">
            {metric.toUpperCase()} · {data.cohort_mode} mode
          </span>
        </h3>
      </div>
      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-zinc-700 bg-zinc-900/50">
              <th className="px-2 py-1.5 text-xs font-medium text-zinc-400">Player</th>
              <th className="px-2 py-1.5 text-xs font-medium text-zinc-400">Class</th>
              <th className="px-2 py-1.5 text-xs font-medium text-zinc-400 text-center">
                {singleBoss ? data.selected_encounters[0] : "Avg Parse"}
              </th>
              {singleBoss && (
                <th className="px-2 py-1.5 text-xs font-medium text-zinc-400 text-right">
                  {metric.toUpperCase()}
                </th>
              )}
              {singleBoss && (
                <th className="px-2 py-1.5 text-xs font-medium text-zinc-400 text-right">
                  Sample
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player) => (
              <PlayerParseRow
                key={player.player_guid}
                player={player}
                encounterNames={data.selected_encounters}
                singleBoss={singleBoss}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
