import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, AlertCircle } from "lucide-react";
import type {
  GuildBestRun,
  GuildBestRunsResponse,
  InstanceTimeParsesResponse,
} from "@/api/typesGenerated";
import { parseColor } from "@/pages/Instance/parseColors";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import { instanceAccentGradient } from "./instanceColors";
import { formatClearDuration } from "./clearTimeUtils";

interface BestPerformanceConfig {
  rankBy: "parse" | "time";
  timeWindow: "30" | "60" | "90";
}

function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function BestRunRow({
  run,
  rankBy,
  clearParse,
}: {
  run: GuildBestRun;
  rankBy: "parse" | "time";
  clearParse?: number;
}) {
  const duration = formatClearDuration(run.duration_ms);
  const instanceUrl = run.instance_slug
    ? `/instances/${run.instance_slug}`
    : `/instances/${run.instance_id}`;

  const meta = [
    formatRunDate(run.completed_at),
    run.max_players > 0 ? `${run.max_players}-player` : "",
    run.difficulty_name !== "Normal" ? run.difficulty_name : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const parseBadge =
    clearParse !== undefined ? (
      <span
        className={`font-bold tabular-nums ${parseColor(clearParse)} ${rankBy === "parse" ? "min-w-9 text-right text-2xl" : "text-lg"}`}
        title="Clear time parse for this run"
      >
        {clearParse}
      </span>
    ) : (
      <span className={`text-sm text-muted-foreground/50 ${rankBy === "parse" ? "min-w-9 text-right" : ""}`}>
        —
      </span>
    );

  return (
    <Link
      to={instanceUrl}
      className="relative flex items-center gap-4 overflow-hidden rounded-lg border border-border/60 bg-card pl-4 pr-4 py-2.5 hover:border-border transition-colors"
    >
      <span
        className="absolute inset-y-0 left-0 w-[5px]"
        style={{ background: instanceAccentGradient(run.instance_name) }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{run.instance_name}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground tabular-nums">{meta}</p>
      </div>
      {rankBy === "parse" ? (
        <>
          <span className="text-xs text-muted-foreground tabular-nums" title="Clear time">
            {duration}
          </span>
          {parseBadge}
        </>
      ) : (
        <>
          {parseBadge}
          <span
            className="min-w-16 text-right text-xl font-bold tabular-nums text-foreground"
            title="Clear time"
          >
            {duration}
          </span>
        </>
      )}
    </Link>
  );
}

function BestPerformanceContent({ config, guild }: GuildPanelRenderProps<BestPerformanceConfig>) {
  const [runs, setRuns] = useState<GuildBestRun[]>([]);
  const [clearParses, setClearParses] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rankBy = config.rankBy === "time" ? "time" : "parse";
  const timeWindow = ["30", "90"].includes(config.timeWindow) ? config.timeWindow : "60";

  useEffect(() => {
    let cancelled = false;
    const fetchRuns = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("since_days", timeWindow);
        params.set("by", rankBy);
        const response = await fetch(`/api/v1/guilds/${guild.id}/best-runs?${params}`);
        if (!response.ok) throw new Error("Failed to fetch best runs");
        const data = (await response.json()) as GuildBestRunsResponse;
        if (!cancelled) setRuns([...(data.runs ?? [])]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchRuns();
    return () => {
      cancelled = true;
    };
  }, [guild.id, timeWindow, rankBy]);

  // The parse shown is the run's clear-time parse (the whole clear scored
  // against the population), fetched per winning run.
  useEffect(() => {
    if (runs.length === 0) return;
    let cancelled = false;
    const fetchParses = async () => {
      const entries = await Promise.all(
        runs.map(async (run) => {
          try {
            const response = await fetch(
              `/api/v1/rankings/instances/${run.instance_id}/time-parses?period=${timeWindow}d`,
            );
            if (!response.ok) return null;
            const data = (await response.json()) as InstanceTimeParsesResponse;
            if (!data.available || !data.clear_time) return null;
            return [run.run_id, data.clear_time.display_score] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setClearParses(Object.fromEntries(entries.filter((e): e is [string, number] => e !== null)));
    };
    fetchParses();
    return () => {
      cancelled = true;
    };
  }, [runs, timeWindow]);

  const sorted = useMemo(() => {
    const list = [...runs];
    if (rankBy === "parse") {
      list.sort((a, b) => b.avg_parse - a.avg_parse);
    } else {
      list.sort((a, b) => a.instance_name.localeCompare(b.instance_name));
    }
    return list;
  }, [runs, rankBy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[100px] text-muted-foreground gap-2">
        <AlertCircle className="h-5 w-5" />
        <p className="text-xs">Failed to load best runs</p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm">No full clears in the last {timeWindow} days</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-1">
      <div className="flex items-center justify-between pb-1 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-wider">
          Best {rankBy === "parse" ? "parse" : "time"} per raid
        </span>
        <span>Last {timeWindow} days</span>
      </div>
      <div className="flex flex-col gap-2">
        {sorted.map((run) => (
          <BestRunRow key={run.run_id} run={run} rankBy={rankBy} clearParse={clearParses[run.run_id]} />
        ))}
      </div>
    </div>
  );
}

export const BestPerformancePanel: GuildPanelDefinition<BestPerformanceConfig> = {
  type: "best_performance",
  label: "Best Performance",
  icon: <Award className="h-4 w-4" />,
  description: "The guild's best full clear of each raid, by parse or by clear time",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 10 },
  configSchema: [
    {
      name: "rankBy",
      label: "Pick the best run by",
      type: "select",
      options: [
        { value: "parse", label: "Average parse" },
        { value: "time", label: "Clear time" },
      ],
      defaultValue: "parse",
    },
    {
      name: "timeWindow",
      label: "Time period",
      type: "select",
      options: [
        { value: "30", label: "Last 30 days" },
        { value: "60", label: "Last 60 days" },
        { value: "90", label: "Last 90 days" },
      ],
      defaultValue: "60",
    },
  ],
  defaultConfig: {
    rankBy: "parse",
    timeWindow: "60",
  },
  render: (props) => <BestPerformanceContent {...props} />,
};
