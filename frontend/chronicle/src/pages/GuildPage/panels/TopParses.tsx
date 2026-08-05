import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, AlertCircle } from "lucide-react";
import type { GuildTopParse, GuildTopParsesResponse } from "@/api/typesGenerated";
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay";
import { parseColor } from "@/pages/Instance/parseColors";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface TopParsesConfig {
  metric: "dps" | "hps";
  timeWindow: "all" | "90" | "60" | "30";
  limit: number;
  bestPerPlayer: boolean;
}

const TIME_WINDOW_LABELS: Record<string, string> = {
  "90": "Last 90 days",
  "60": "Last 60 days",
  "30": "Last 30 days",
};

function formatMetricValue(parse: GuildTopParse): string {
  const rounded = Math.round(parse.metric_value).toLocaleString();
  return `${rounded} ${parse.metric.toUpperCase()}`;
}

function ParseRow({ parse, rank }: { parse: GuildTopParse; rank: number }) {
  const color = CLASS_CSS_VAR[parse.player_class] ?? CLASS_CSS_VAR.UNKNOWN;
  const killedAt = new Date(parse.killed_at);
  const tooltip = `${formatMetricValue(parse)} · ${killedAt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })} · view raid log`;
  const instanceUrl = parse.instance_slug
    ? `/instances/${parse.instance_slug}`
    : `/instances/${parse.instance_id}`;

  return (
    <Link
      to={instanceUrl}
      className="grid grid-cols-[24px_1fr_auto] items-center gap-2.5 border-b border-border/40 py-1.5 last:border-b-0 hover:bg-muted/30 rounded-sm px-1 -mx-1"
      title={tooltip}
    >
      <span className="text-sm text-muted-foreground/70 tabular-nums">#{rank}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight" style={{ color }}>
          {parse.player_name}
          {parse.player_spec && (
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              {parse.player_spec}
            </span>
          )}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {parse.encounter_name} · {parse.instance_name}
        </p>
      </div>
      <span className={`text-lg font-bold tabular-nums ${parseColor(parse.display_score)}`}>
        {parse.display_score}
      </span>
    </Link>
  );
}

function TopParsesContent({ config, position, guild }: GuildPanelRenderProps<TopParsesConfig>) {
  const [parses, setParses] = useState<GuildTopParse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const metric = config.metric === "hps" ? "hps" : "dps";
  const sinceDays = TIME_WINDOW_LABELS[config.timeWindow] ? config.timeWindow : "";
  const limit = config.limit || 10;
  const bestPerPlayer = config.bestPerPlayer !== false;

  useEffect(() => {
    let cancelled = false;
    const fetchParses = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("metric", metric);
        params.set("limit", String(Math.min(limit, 100)));
        params.set("best_per_player", String(bestPerPlayer));
        if (sinceDays) params.set("since_days", sinceDays);
        const response = await fetch(`/api/v1/guilds/${guild.id}/parses/top?${params}`);
        if (!response.ok) throw new Error("Failed to fetch top parses");
        const data = (await response.json()) as GuildTopParsesResponse;
        if (!cancelled) setParses([...(data.parses ?? [])]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchParses();
    return () => {
      cancelled = true;
    };
  }, [guild.id, metric, sinceDays, limit, bestPerPlayer]);

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
        <p className="text-xs">Failed to load top parses</p>
      </div>
    );
  }

  if (parses.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm">
          {sinceDays
            ? `No ${metric.toUpperCase()} parses in the ${TIME_WINDOW_LABELS[sinceDays].toLowerCase()}`
            : `No ${metric.toUpperCase()} parses recorded yet`}
        </p>
      </div>
    );
  }

  // Two columns of rows when the panel is wide enough.
  const cols = position.w >= 8 ? 2 : 1;

  return (
    <div className="flex h-full flex-col p-1">
      <div className="flex items-center justify-between pb-1 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-wider">{metric}</span>
        <span>{sinceDays ? TIME_WINDOW_LABELS[sinceDays] : "All time"}</span>
      </div>
      <div
        className="grid gap-x-6 content-start"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {parses.map((parse, i) => (
          <ParseRow
            key={`${parse.player_guid}-${parse.encounter_name}-${parse.killed_at}`}
            parse={parse}
            rank={i + 1}
          />
        ))}
      </div>
    </div>
  );
}

export const TopParsesPanel: GuildPanelDefinition<TopParsesConfig> = {
  type: "top_parses",
  label: "Top Parses",
  icon: <Star className="h-4 w-4" />,
  description: "The guild's best parses, ranked",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 10 },
  configSchema: [
    {
      name: "metric",
      label: "Metric",
      type: "select",
      options: [
        { value: "dps", label: "DPS" },
        { value: "hps", label: "HPS" },
      ],
      defaultValue: "dps",
    },
    {
      name: "timeWindow",
      label: "Time period",
      type: "select",
      options: [
        { value: "all", label: "All time" },
        { value: "90", label: "Last 90 days" },
        { value: "60", label: "Last 60 days" },
        { value: "30", label: "Last 30 days" },
      ],
      defaultValue: "all",
    },
    {
      name: "limit",
      label: "Number of parses to show",
      type: "number",
      defaultValue: 10,
    },
    {
      name: "bestPerPlayer",
      label: "Only best parse per player",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    metric: "dps",
    timeWindow: "all",
    limit: 10,
    bestPerPlayer: true,
  },
  render: (props) => <TopParsesContent {...props} />,
};
