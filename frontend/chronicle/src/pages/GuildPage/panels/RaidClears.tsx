import { useEffect, useState } from "react";
import { Trophy, AlertCircle, CheckCircle, Clock } from "lucide-react";
import type { GuildRaidClear, GuildRaidClearsResponse } from "@/api/typesGenerated";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import { formatClearDuration } from "./clearTimeUtils";

interface RaidClearsConfig {
  displayMode: "cards" | "list";
  timeWindow: "all" | "90" | "60" | "30";
  showBestTime: boolean;
  showAvgTime: boolean;
  showLastCleared: boolean;
}

const TIME_WINDOW_LABELS: Record<string, string> = {
  "90": "Last 90 days",
  "60": "Last 60 days",
  "30": "Last 30 days",
};

function formatLastCleared(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Panels saved before a toggle existed have no key for it in their stored
// config; treat missing as enabled so new stats show up without re-saving.
function normalizeConfig(config: RaidClearsConfig): RaidClearsConfig {
  return {
    ...config,
    showBestTime: config.showBestTime !== false,
    showAvgTime: config.showAvgTime !== false,
    showLastCleared: config.showLastCleared !== false,
  };
}

function TimeWindowBadge({ label, onDark }: { label: string; onDark?: boolean }) {
  return (
    <span
      className={
        onDark
          ? "inline-flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white/80 px-2 py-0.5 rounded-full text-[10px] font-medium"
          : "inline-flex items-center gap-1 bg-primary/10 text-muted-foreground px-2 py-0.5 rounded-full text-[10px] font-medium"
      }
    >
      <Clock className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function RaidClearCard({
  clear,
  config,
  windowLabel,
}: {
  clear: GuildRaidClear;
  config: RaidClearsConfig;
  windowLabel?: string;
}) {
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

      {/* Time window badge - top left */}
      {windowLabel && (
        <div className="absolute top-2 left-2 z-10">
          <TimeWindowBadge label={windowLabel} onDark />
        </div>
      )}

      {/* Clear count badge - top right */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums"
        title={`Cleared ${clear.clear_count} times${windowLabel ? ` in the ${windowLabel.toLowerCase()}` : ""}`}
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
          <span className="flex items-center gap-3">
            {config.showBestTime && (
              <span className="tabular-nums">
                Best time: <span className="font-medium text-white">{formatClearDuration(clear.best_duration_ms)}</span>
              </span>
            )}
            {config.showAvgTime && (
              <span className="tabular-nums">
                Avg: <span className="font-medium text-white">{formatClearDuration(clear.avg_duration_ms)}</span>
              </span>
            )}
          </span>
          {config.showLastCleared && (
            <span className="ml-auto text-right">Last cleared {formatLastCleared(clear.last_cleared_at)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function RaidClearsContent({ config: rawConfig, position, guild }: GuildPanelRenderProps<RaidClearsConfig>) {
  const config = normalizeConfig(rawConfig);
  const [clears, setClears] = useState<GuildRaidClear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sinceDays = TIME_WINDOW_LABELS[config.timeWindow] ? config.timeWindow : "";

  useEffect(() => {
    let cancelled = false;
    const fetchClears = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (sinceDays) params.set("since_days", sinceDays);
        const response = await fetch(`/api/v1/guilds/${guild.id}/speedruns/clears?${params}`);
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
  }, [guild.id, sinceDays]);

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

  const windowLabel = TIME_WINDOW_LABELS[config.timeWindow];

  if (clears.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm">
          {windowLabel ? `No raid clears in the ${windowLabel.toLowerCase()}` : "No raid clears recorded yet"}
        </p>
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
          <RaidClearCard
            key={clear.instance_name}
            clear={clear}
            config={config}
            windowLabel={windowLabel}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border/50 p-1">
      {clears.map((clear) => (
        <div key={clear.instance_name} className="flex items-center gap-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate flex items-center gap-2">
              {clear.instance_name}
              {windowLabel && <TimeWindowBadge label={windowLabel} />}
            </p>
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
          {config.showAvgTime && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Avg:{" "}
              <span className="font-medium text-foreground">
                {formatClearDuration(clear.avg_duration_ms)}
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
      name: "showBestTime",
      label: "Show best time",
      type: "boolean",
      defaultValue: true,
    },
    {
      name: "showAvgTime",
      label: "Show average time",
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
    timeWindow: "all",
    showBestTime: true,
    showAvgTime: true,
    showLastCleared: true,
  },
  render: (props) => <RaidClearsContent {...props} />,
};
