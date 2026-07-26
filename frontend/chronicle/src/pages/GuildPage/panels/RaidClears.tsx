import { useEffect, useState } from "react";
import { Trophy, AlertCircle } from "lucide-react";
import type { GuildRaidClear, GuildRaidClearsResponse } from "@/api/typesGenerated";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import { formatClearDuration } from "./clearTimeUtils";

interface RaidClearsConfig {
  showBestTime: boolean;
  showLastCleared: boolean;
}

function RaidClearsContent({ config, guild }: GuildPanelRenderProps<RaidClearsConfig>) {
  const [clears, setClears] = useState<GuildRaidClear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchClears = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/guilds/${guild.id}/speedruns/clears`);
        if (!response.ok) throw new Error("Failed to fetch raid clears");
        const data = (await response.json()) as GuildRaidClearsResponse;
        if (!cancelled) setClears([...(data.clears ?? [])]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchClears();
    return () => {
      cancelled = true;
    };
  }, [guild.id]);

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
        <p className="text-xs">Failed to load raid clears</p>
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
    <div className="flex flex-col divide-y divide-border/50 p-1">
      {clears.map((clear) => (
        <div key={clear.instance_name} className="flex items-center gap-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{clear.instance_name}</p>
            {config.showLastCleared && (
              <p className="text-xs text-muted-foreground">
                Last cleared{" "}
                {new Date(clear.last_cleared_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
          {config.showBestTime && (
            <span className="text-xs text-muted-foreground tabular-nums" title="Best clear time">
              {formatClearDuration(clear.best_duration_ms)}
            </span>
          )}
          <span
            className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold tabular-nums"
            title={`${clear.clear_count} clears`}
          >
            {clear.clear_count}
          </span>
        </div>
      ))}
    </div>
  );
}

export const RaidClearsPanel: GuildPanelDefinition<RaidClearsConfig> = {
  type: "raid_clears",
  label: "Raid Clears",
  icon: <Trophy className="h-4 w-4" />,
  description: "Shows how many times the guild has cleared each raid instance",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 8 },
  configSchema: [
    {
      name: "showBestTime",
      label: "Show best clear time",
      type: "boolean",
      defaultValue: true,
    },
    {
      name: "showLastCleared",
      label: "Show last cleared date",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    showBestTime: true,
    showLastCleared: true,
  },
  render: (props) => <RaidClearsContent {...props} />,
};
