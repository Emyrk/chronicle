import { useQuery } from "@tanstack/react-query";
import { Trophy, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import type { SpeedrunResult } from "@/api/typesGenerated";
import type { ProcessorEvent } from "../processorTypes";
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

// Factory export intentionally lives beside the panel components.
// eslint-disable-next-line react-refresh/only-export-components
export function createLeaderboardPanel(): PanelDefinition<LeaderboardPanelResult, ProcessorEvent> {
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

export function LeaderboardContent({
  speedrunOverride,
  ...props
}: PanelRenderProps<LeaderboardPanelResult> & { speedrunOverride?: SpeedrunResult | null }) {
  if (speedrunOverride !== undefined) {
    return speedrunOverride ? <LeaderboardDetails speedrun={speedrunOverride} /> : <LeaderboardEmptyState />;
  }

  return <LeaderboardQueryContent {...props} />;
}

function LeaderboardQueryContent(props: PanelRenderProps<LeaderboardPanelResult>) {
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

  return speedrun ? <LeaderboardDetails speedrun={speedrun} /> : <LeaderboardEmptyState />;
}

function LeaderboardEmptyState() {
  return (
    <div className="text-center py-4 text-muted-foreground text-sm">
      No speedrun data available for this instance.
    </div>
  );
}

export function LeaderboardDetails({ speedrun }: { speedrun: SpeedrunResult }) {
  const satisfied = speedrun.proof.filter((p) => p.satisfied).length;
  const total = speedrun.proof.length;
  const rankedDurationMs = speedrun.ranked_duration_ms ?? speedrun.duration_ms;

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3" data-lesson-target="read-proof">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-zinc-200">Speedrun</span>
        </div>
        <div
          className="flex items-center gap-2"
          data-lesson-target="find-blockers"
          data-leaderboard-region="status"
        >
          {speedrun.qualified ? (
            <>
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <div className="grid grid-cols-2 gap-x-3 text-right">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Ranked time</div>
                  <div className="font-mono text-sm font-semibold text-emerald-400">
                    {formatDuration(rankedDurationMs)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Clear time</div>
                  <div className="font-mono text-sm font-semibold text-zinc-300">
                    {formatDuration(speedrun.duration_ms)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <span className="text-xs font-medium text-zinc-500">
              Incomplete ({satisfied}/{total})
            </span>
          )}
        </div>
      </div>

      {Object.entries(
        speedrun.proof.reduce<Record<string, Array<typeof speedrun.proof[number]>>>((acc, p) => {
          const cat = p.requirement.category || "Other";
          (acc[cat] ??= []).push(p);
          return acc;
        }, {})
      ).map(([category, proofs]) => (
        <div key={category} className="mb-2" data-lesson-target="read-proof">
          <div className="text-xs font-medium text-zinc-500 mb-1">{category}</div>
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1"
            data-leaderboard-region={`proof-${category.toLowerCase()}`}
          >
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
        <div
          className="mt-3 pt-3 border-t border-zinc-800"
          data-lesson-target="eligibility-checks"
          data-leaderboard-region="versions"
        >
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

      {speedrun.data_source && (
        <div
          className="mt-3 pt-3 border-t border-zinc-800"
          data-lesson-target="eligibility-checks"
          data-leaderboard-region="data-source"
        >
          <div className="flex items-center gap-1.5 text-xs mb-1">
            {speedrun.data_source.eligible ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500 shrink-0" />
            )}
            <span className="font-medium text-zinc-500">
              Data Source:{" "}
              <span className={speedrun.data_source.eligible ? "text-zinc-300" : "text-red-400"}>
                {speedrun.data_source.has_server_side
                  ? "Server-side"
                  : speedrun.data_source.has_addon_version
                    ? "Addon"
                    : "No server-side capability or addon version detected"}
              </span>
            </span>
          </div>
        </div>
      )}

      {speedrun.dps_rankings && (
        <div
          className="mt-3 pt-3 border-t border-zinc-800"
          data-lesson-target="eligibility-checks"
          data-leaderboard-region="dps-rankings"
        >
          <div className="flex items-center gap-1.5 text-xs mb-1">
            {speedrun.dps_rankings.has_rankings ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 text-zinc-600 shrink-0" />
            )}
            <span className="font-medium text-zinc-500">
              DPS Rankings:{" "}
              <span className={speedrun.dps_rankings.has_rankings ? "text-zinc-300" : "text-zinc-500"}>
                {speedrun.dps_rankings.has_rankings ? "Recorded" : "Not recorded"}
              </span>
            </span>
          </div>
        </div>
      )}

      {speedrun.level_range && (
        <div
          className="mt-3 pt-3 border-t border-zinc-800"
          data-lesson-target="find-blockers"
          data-leaderboard-region="level-range"
        >
          <div className="flex items-center gap-1.5 text-xs mb-1">
            {speedrun.level_range.satisfied ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500 shrink-0" />
            )}
            <span className="font-medium text-zinc-500">
              Level Requirement:{" "}
              <span className={speedrun.level_range.satisfied ? "text-zinc-300" : "text-red-400"}>
                {speedrun.level_range.requirement.min_level === speedrun.level_range.requirement.max_level
                  ? speedrun.level_range.requirement.min_level
                  : `${speedrun.level_range.requirement.min_level}–${speedrun.level_range.requirement.max_level}`}
              </span>
            </span>
          </div>
          {speedrun.level_range.violators.length > 0 && (
            <div className="ml-5 space-y-0.5">
              {speedrun.level_range.violators.map((v) => (
                <div key={v.player_name} className="flex items-center gap-1.5 text-xs text-red-400">
                  <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                  {v.player_name}
                  <span className="text-zinc-500">
                    — Level {v.level === 0 ? "unknown" : v.level}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
