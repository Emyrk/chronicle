import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, AlertCircle } from "lucide-react";
import type {
  GuildRunParsesResponse,
  RecentInstance,
  RecentInstancesResponse,
} from "@/api/typesGenerated";
import { getInstanceCategory } from "@/pages/Logs/utils/instanceImages";
import { parseColor } from "@/pages/Instance/parseColors";
import { RaidCard } from "@/pages/Recent/RaidCard";
import { groupDuplicateInstances } from "@/utils/groupDuplicates";
import { DuplicateInstanceModal } from "@/components/DuplicateInstanceModal";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import { formatClearDuration } from "./clearTimeUtils";

type CategoryFilter = "all" | "raid" | "dungeon";

interface RecentRaidsConfig {
  displayMode: "cards" | "list";
  limit: number;
  category: CategoryFilter;
  hasVideo: "all" | "with";
}

function runID(instance: RecentInstance): string {
  return instance.duplicate_group_id ?? instance.id;
}

function formatRaidDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One raid night as a compact row: name, meta with clear time, guild avg parse. */
function RaidListRow({ instance, avgParse }: { instance: RecentInstance; avgParse?: number }) {
  const meta = [
    `${instance.player_count} players`,
    formatRaidDate(instance.first_encounter_time),
    `${instance.boss_kills}/${instance.boss_count} bosses`,
    instance.duration_ms ? formatClearDuration(instance.duration_ms) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const score = avgParse !== undefined ? Math.round(avgParse) : undefined;
  const instanceUrl = instance.slug ? `/instances/${instance.slug}` : `/instances/${instance.id}`;

  return (
    <Link
      to={instanceUrl}
      className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 hover:bg-muted/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {instance.name}
          {instance.difficulty_name && instance.difficulty_name !== "Normal" && (
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              {instance.difficulty_name}
            </span>
          )}
        </p>
        <p className="truncate text-[11px] text-muted-foreground tabular-nums">{meta}</p>
      </div>
      {score !== undefined && (
        <span
          className={`text-xl font-bold tabular-nums ${parseColor(score)}`}
          title="Average guild parse for this raid"
        >
          {score}
        </span>
      )}
    </Link>
  );
}

function RecentRaidsContent({ config, position, guild }: GuildPanelRenderProps<RecentRaidsConfig>) {
  // Derive columns from panel grid width (1-12 columns)
  const cols = position.w >= 9 ? 3 : position.w >= 6 ? 2 : 1;
  const [instances, setInstances] = useState<RecentInstance[]>([]);
  const [runParses, setRunParses] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const displayMode = config.displayMode === "list" ? "list" : "cards";
  const limit = config.limit || 5;
  const category = config.category || "all";
  const hasVideo = config.hasVideo === "with";

  const fetchRecent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch extra to account for client-side category filtering
      const fetchLimit = category !== "all" ? limit * 4 : limit;
      const params = new URLSearchParams();
      params.set("limit", String(Math.min(fetchLimit, 100)));
      if (guild.id) params.set("guild_id", guild.id);
      if (hasVideo) params.set("has_video", "true");

      const response = await fetch(`/api/v1/raidlogs/recent?${params}`);
      if (!response.ok) throw new Error("Failed to fetch recent instances");
      const data = (await response.json()) as RecentInstancesResponse;
      setInstances([...(data.instances ?? [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [guild.id, limit, category, hasVideo]);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  const filtered = useMemo(() => {
    let result = instances;
    if (category !== "all") {
      result = result.filter((inst) => getInstanceCategory(inst.name) === category);
    }
    return result;
  }, [instances, category]);

  const groups = useMemo(() => groupDuplicateInstances(filtered).slice(0, limit), [filtered, limit]);

  // List mode shows the guild's average parse per raid night.
  const runIDs = useMemo(() => {
    if (displayMode !== "list") return "";
    return [...new Set(groups.map((group) => runID(group[0])))].join(",");
  }, [displayMode, groups]);

  useEffect(() => {
    if (!runIDs) return;
    let cancelled = false;
    const fetchParses = async () => {
      try {
        const params = new URLSearchParams();
        params.set("run_ids", runIDs);
        const response = await fetch(`/api/v1/guilds/${guild.id}/parses/runs?${params}`);
        if (!response.ok) return;
        const data = (await response.json()) as GuildRunParsesResponse;
        if (cancelled) return;
        const byRun: Record<string, number> = {};
        for (const run of data.runs ?? []) {
          byRun[run.run_id] = run.avg_parse;
        }
        setRunParses(byRun);
      } catch {
        // Scores are decorative; the list still renders without them.
      }
    };
    fetchParses();
    return () => {
      cancelled = true;
    };
  }, [guild.id, runIDs]);

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
        <p className="text-xs">Failed to load recent instances</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm">No recent instances found</p>
      </div>
    );
  }

  if (displayMode === "list") {
    return (
      <div className="flex flex-col gap-2 p-1">
        {groups.map((group) => (
          <RaidListRow
            key={group[0].id}
            instance={group[0]}
            avgParse={runParses[runID(group[0])]}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid gap-3 p-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {groups.map((group) => (
        <DuplicateAwareRaidCard key={group[0].id} group={group} />
      ))}
    </div>
  );
}

function DuplicateAwareRaidCard({ group }: { group: RecentInstance[] }) {
  const [showModal, setShowModal] = useState(false);

  if (group.length === 1) {
    return <RaidCard instance={group[0]} />;
  }

  return (
    <>
      <div className="relative cursor-pointer" onClick={(e) => { e.preventDefault(); setShowModal(true); }}>
        <RaidCard instance={group[0]} />
        {/* Duplicate badge overlay */}
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-black/70 backdrop-blur-sm text-white/80 px-1.5 py-0.5 rounded text-[10px] font-medium pointer-events-none">
          {group.length} logs
        </div>
      </div>
      {showModal && (
        <DuplicateInstanceModal
          instances={group}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

export const RecentRaidsPanel: GuildPanelDefinition<RecentRaidsConfig> = {
  type: "recent_raids",
  label: "Recent",
  icon: <Calendar className="h-4 w-4" />,
  description: "Shows recent raid and dungeon instances with filtering",
  defaultSize: { w: 12, h: 4 },
  minSize: { w: 4, h: 2 },
  maxSize: { w: 12, h: 8 },
  configSchema: [
    {
      name: "displayMode",
      label: "Display",
      type: "select",
      options: [
        { value: "cards", label: "Show as cards" },
        { value: "list", label: "Compact list with clear times and parses" },
      ],
      defaultValue: "cards",
    },
    {
      name: "limit",
      label: "Number of instances to show",
      type: "number",
      defaultValue: 6,
    },
    {
      name: "category",
      label: "Category",
      type: "select",
      options: [
        { value: "all", label: "All" },
        { value: "raid", label: "Raids Only" },
        { value: "dungeon", label: "Dungeons Only" },
      ],
      defaultValue: "all",
    },
    {
      name: "hasVideo",
      label: "Video",
      type: "select",
      options: [
        { value: "all", label: "All" },
        { value: "with", label: "With Video Only" },
      ],
      defaultValue: "all",
    },
  ],
  defaultConfig: {
    displayMode: "cards",
    limit: 6,
    category: "all",
    hasVideo: "all",
  },
  render: (props) => <RecentRaidsContent {...props} />,
};
