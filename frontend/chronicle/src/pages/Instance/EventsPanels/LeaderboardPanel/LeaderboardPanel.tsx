import { useQuery } from "@tanstack/react-query";
import { Trophy, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import type { SpeedrunResult } from "@/api/typesGenerated";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { leaderboardProcessor, type LeaderboardPanelResult } from "./leaderboard.processor";

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

export function createLeaderboardPanel(): PanelDefinition<LeaderboardPanelResult, any> {
  return {
    ...leaderboardProcessor,
    label: "Leaderboard",
    icon: <Trophy className="h-4 w-4" />,
    supportsPerSecond: false,

    render: (props: PanelRenderProps<LeaderboardPanelResult>) => {
      return <LeaderboardContent {...props} />;
    },
  };
}

function LeaderboardContent(props: PanelRenderProps<LeaderboardPanelResult>) {
  const instanceId = props.context.instance.id;

  const { data: speedrun, isLoading: loading } = useQuery({
    queryKey: ["instance-speedrun", instanceId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/raidlogs/instances/${encodeURIComponent(instanceId)}/speedrun`);
      if (!res.ok) return null;
      return res.json() as Promise<SpeedrunResult>;
    },
    staleTime: Infinity,
    retry: false,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!speedrun) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        No speedrun data available for this instance.
      </div>
    );
  }

  const satisfied = speedrun.proof.filter((p) => p.satisfied).length;
  const total = speedrun.proof.length;

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-zinc-200">Speedrun</span>
        </div>
        <div className="flex items-center gap-2">
          {speedrun.qualified ? (
            <>
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400">
                {formatDuration(speedrun.duration_ms)}
              </span>
            </>
          ) : (
            <span className="text-xs font-medium text-zinc-500">
              Incomplete ({satisfied}/{total})
            </span>
          )}
        </div>
      </div>

      {Object.entries(
        speedrun.proof.reduce<Record<string, typeof speedrun.proof>>((acc, p) => {
          const cat = p.requirement.category || "Other";
          (acc[cat] ??= []).push(p);
          return acc;
        }, {})
      ).map(([category, proofs]) => (
        <div key={category} className="mb-2">
          <div className="text-xs font-medium text-zinc-500 mb-1">{category}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1">
            {proofs.map((proof) => (
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
                  {proof.requirement.count > 1 && (
                    <span className="text-zinc-500"> ×{proof.requirement.count}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {speedrun.version_status && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <div className="text-xs font-medium text-zinc-500 mb-1">Version Requirements</div>
          <div className="grid grid-cols-2 gap-1">
            <div className="flex items-center gap-1.5 text-xs px-1.5 py-0.5 rounded">
              {speedrun.version_status.parser_qualified ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500 shrink-0" />
              )}
              <span className={speedrun.version_status.parser_qualified ? "text-zinc-300" : "text-red-400"}>
                Parser: {speedrun.version_status.parser_version || "unknown"}
                <span className="text-zinc-500"> (min {speedrun.version_status.min_parser_version || "none"})</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs px-1.5 py-0.5 rounded">
              {speedrun.version_status.addon_qualified ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500 shrink-0" />
              )}
              <span className={speedrun.version_status.addon_qualified ? "text-zinc-300" : "text-red-400"}>
                Addon: {speedrun.version_status.addon_version || "unknown"}
                <span className="text-zinc-500"> (min {speedrun.version_status.min_addon_version || "none"})</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
