import { CheckCircle2, XCircle, Clock, Trophy } from "lucide-react";
import type { SpeedrunResult } from "@/api/typesGenerated";

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

interface SpeedrunProofProps {
  speedrun: SpeedrunResult;
}

export function SpeedrunProof({ speedrun }: SpeedrunProofProps) {
  const satisfied = speedrun.proof.filter((p) => p.satisfied).length;
  const total = speedrun.proof.length;
  const rankedDuration = speedrun.ranked_duration_ms ?? speedrun.duration_ms;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-zinc-200">Speedrun</span>
        </div>
        <div className="flex items-center gap-2">
          {speedrun.qualified ? (
            <>
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span
                className="text-sm font-semibold text-emerald-400"
                title="Ranked time, from the first required boss pull to the final required boss encounter end"
              >
                {formatDuration(rankedDuration)}
              </span>
            </>
          ) : (
            <span className="text-xs font-medium text-zinc-500">
              Incomplete ({satisfied}/{total})
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1">
        {speedrun.proof.map((proof) => (
          <div
            key={proof.requirement.name}
            className="flex items-center gap-1.5 text-xs px-1.5 py-0.5 rounded"
          >
            {proof.satisfied ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 text-zinc-600 shrink-0" />
            )}
            <span
              className={
                proof.satisfied ? "text-zinc-300" : "text-zinc-600"
              }
            >
              {proof.requirement.name}
            </span>
          </div>
        ))}
      </div>

      {speedrun.level_range && (
        <div className="mt-2 border-t border-zinc-800 pt-2">
          <div className="flex items-center gap-1.5 text-xs mb-1">
            {speedrun.level_range.satisfied ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500 shrink-0" />
            )}
            <span className="text-zinc-300">
              Level Range: {speedrun.level_range.requirement.min_level}
              –{speedrun.level_range.requirement.max_level}
            </span>
          </div>
          {!speedrun.level_range.satisfied &&
            speedrun.level_range.violators?.map((v) => (
              <div
                key={v.player_name}
                className="ml-5 text-xs text-red-400"
              >
                {v.player_name} — Level {v.level}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
