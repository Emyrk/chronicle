import { useEffect, useState } from "react";
import { Trophy, AlertCircle, CheckCircle } from "lucide-react";
import type { GuildRaidClear, GuildRaidClearsResponse } from "@/api/typesGenerated";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import { formatClearDuration } from "./clearTimeUtils";

interface RaidClearsConfig {
  displayMode: "cards" | "list";
  showBestTime: boolean;
  showLastCleared: boolean;
}

function formatLastCleared(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function RaidClearCard({ clear, config }: { clear: GuildRaidClear; config: RaidClearsConfig }) {
  const [imageError, setImageError] = useState(false);
  const backgroundImage = getInstanceBackground(clear.instance_name);

  return (
    <div className="relative h-28 rounded-lg overflow-hidden group">
      {/* Solid color fallback background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />

      {/* Background image - cropped to hide top/bottom decorative borders */}
      {!imageError && (
        <img
          src={backgroundImage}
          alt=""
          onError={() => setImageError(true)}
          className="absolute transition-transform duration-300 group-hover:scale-105 object-cover"
          style={{
            objectPosition: "center 35%",
            top: "-15%",
            bottom: "-10%",
            left: 0,
            right: 0,
            width: "100%",
            height: "125%",
          }}
        />
      )}

      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30" />

      {/* Clear count badge - top right */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums"
        title={`Cleared ${clear.clear_count} times`}
      >
        <CheckCircle className="h-3 w-3 text-emerald-400" />
        {clear.clear_count}×
      </div>

      {/* Bottom text */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-2.5">
        <p className="text-sm font-semibold text-white truncate drop-shadow">
          {clear.instance_name}
        </p>
        <div className="flex items-center justify-between gap-3 text-[11px] text-white/80">
          {config.showBestTime && (
            <span className="tabular-nums">
              Best time: <span className="font-medium text-white">{formatClearDuration(clear.best_duration_ms)}</span>
            </span>
          )}
          {config.showLastCleared && (
            <span className="ml-auto text-right">Last cleared {formatLastCleared(clear.last_cleared_at)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function RaidClearsContent({ config, position, guild }: GuildPanelRenderProps<RaidClearsConfig>) {
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

  if (config.displayMode !== "list") {
    // Card view (default) - derive columns from panel grid width
    const cols = position.w >= 9 ? 3 : position.w >= 6 ? 2 : 1;
    return (
      <div
        className="grid gap-3 p-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {clears.map((clear) => (
          <RaidClearCard key={clear.instance_name} clear={clear} config={config} />
        ))}
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
                Last cleared {formatLastCleared(clear.last_cleared_at)}
              </p>
            )}
          </div>
          {config.showBestTime && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Best time:{" "}
              <span className="font-medium text-foreground">
                {formatClearDuration(clear.best_duration_ms)}
              </span>
            </span>
          )}
          <span
            className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold tabular-nums"
            title={`Cleared ${clear.clear_count} times`}
          >
            {clear.clear_count}×
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
      name: "displayMode",
      label: "Display",
      type: "select",
      options: [
        { value: "cards", label: "Show as cards" },
        { value: "list", label: "Compact list" },
      ],
      defaultValue: "cards",
    },
    {
      name: "showBestTime",
      label: "Show best time",
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
    displayMode: "cards",
    showBestTime: true,
    showLastCleared: true,
  },
  render: (props) => <RaidClearsContent {...props} />,
};
