import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Timer, AlertCircle, ExternalLink } from "lucide-react";
import type {
  GuildRaidClear,
  GuildRaidClearsResponse,
  GuildClearTimesResponse,
} from "@/api/typesGenerated";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import { formatClearDuration } from "./clearTimeUtils";

type ViewMode = "list" | "aggregated";

interface ClearTimesConfig {
  instanceName: string;
  defaultView: ViewMode;
}

function ClearTimesContent({ config, guild }: GuildPanelRenderProps<ClearTimesConfig>) {
  const [clears, setClears] = useState<GuildRaidClear[]>([]);
  const [clearsLoading, setClearsLoading] = useState(true);
  const [selectedInstance, setSelectedInstance] = useState<string>(config.instanceName || "");
  const [view, setView] = useState<ViewMode>(config.defaultView === "aggregated" ? "aggregated" : "list");
  const [times, setTimes] = useState<GuildClearTimesResponse | null>(null);
  const [timesLoading, setTimesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the guild's cleared instances to populate the instance selector.
  useEffect(() => {
    let cancelled = false;
    const fetchClears = async () => {
      setClearsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/guilds/${guild.id}/speedruns/clears`);
        if (!response.ok) throw new Error("Failed to fetch raid clears");
        const data = (await response.json()) as GuildRaidClearsResponse;
        if (!cancelled) setClears([...(data.clears ?? [])]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setClearsLoading(false);
      }
    };
    fetchClears();
    return () => {
      cancelled = true;
    };
  }, [guild.id]);

  // Default to the configured instance, falling back to the most-cleared one.
  const instance = useMemo(() => {
    if (selectedInstance && clears.some((c) => c.instance_name === selectedInstance)) {
      return selectedInstance;
    }
    if (config.instanceName && clears.some((c) => c.instance_name === config.instanceName)) {
      return config.instanceName;
    }
    return clears[0]?.instance_name ?? "";
  }, [selectedInstance, config.instanceName, clears]);

  // Fetch clear times for the selected instance.
  useEffect(() => {
    if (!instance) return;
    let cancelled = false;
    const fetchTimes = async () => {
      setTimesLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ instance_name: instance });
        const response = await fetch(`/api/v1/guilds/${guild.id}/speedruns/times?${params}`);
        if (!response.ok) throw new Error("Failed to fetch clear times");
        const data = (await response.json()) as GuildClearTimesResponse;
        if (!cancelled) setTimes(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setTimesLoading(false);
      }
    };
    fetchTimes();
    return () => {
      cancelled = true;
    };
  }, [guild.id, instance]);

  if (clearsLoading) {
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
        <p className="text-xs">Failed to load clear times</p>
      </div>
    );
  }

  if (clears.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm">No raid clears recorded yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-1 h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={instance}
          onChange={(e) => setSelectedInstance(e.target.value)}
          className="flex-1 min-w-0 text-xs bg-background border border-border rounded px-2 py-1"
          aria-label="Instance"
        >
          {clears.map((c) => (
            <option key={c.instance_name} value={c.instance_name}>
              {c.instance_name}
            </option>
          ))}
        </select>
        <div className="flex rounded border border-border overflow-hidden text-xs">
          {(["list", "aggregated"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`px-2 py-1 transition-colors ${
                view === mode
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "list" ? "List View" : "Aggregated View"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {timesLoading || !times ? (
        <div className="flex items-center justify-center flex-1 min-h-[80px]">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
        </div>
      ) : times.times.length === 0 ? (
        <div className="flex items-center justify-center flex-1 min-h-[80px] text-muted-foreground">
          <p className="text-sm">No clears for {instance}</p>
        </div>
      ) : view === "aggregated" ? (
        <div className="grid grid-cols-3 gap-2 flex-1 content-center">
          <div className="rounded-lg bg-primary/5 border border-border/50 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Clears</p>
            <p className="text-lg font-semibold tabular-nums">{times.times.length}</p>
          </div>
          <div className="rounded-lg bg-primary/5 border border-border/50 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Best</p>
            <p className="text-lg font-semibold tabular-nums text-primary">
              {formatClearDuration(times.best_duration_ms)}
            </p>
          </div>
          <div className="rounded-lg bg-primary/5 border border-border/50 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatClearDuration(times.avg_duration_ms)}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/50 overflow-y-auto">
          {times.times.map((t) => {
            const isBest = t.duration_ms === times.best_duration_ms;
            return (
              <div key={t.instance_id} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="flex-1 text-muted-foreground">
                  {new Date(t.completion_time).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                {isBest && <span title="Best time">🏆</span>}
                <span className={`tabular-nums font-medium ${isBest ? "text-primary" : ""}`}>
                  {formatClearDuration(t.duration_ms)}
                </span>
                {(t.slug || t.instance_id) && (
                  <Link
                    to={`/instances/${t.slug || t.instance_id}`}
                    className="text-muted-foreground hover:text-foreground"
                    title="View log"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const ClearTimesPanel: GuildPanelDefinition<ClearTimesConfig> = {
  type: "clear_times",
  label: "Clear Times",
  icon: <Timer className="h-4 w-4" />,
  description: "Shows the guild's clear times for an instance as a list or Best/Avg summary",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 8 },
  configSchema: [
    {
      name: "instanceName",
      label: "Default instance",
      type: "text",
      placeholder: "Defaults to most-cleared instance",
    },
    {
      name: "defaultView",
      label: "Default view",
      type: "select",
      options: [
        { value: "list", label: "List View" },
        { value: "aggregated", label: "Aggregated View" },
      ],
      defaultValue: "list",
    },
  ],
  defaultConfig: {
    instanceName: "",
    defaultView: "list",
  },
  render: (props) => <ClearTimesContent {...props} />,
};
