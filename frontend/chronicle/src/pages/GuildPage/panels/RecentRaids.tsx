import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, AlertCircle, ChevronDown, ExternalLink } from "lucide-react";
import type {
  GuildRunEncounterParse,
  GuildRunParsesResponse,
  RecentInstance,
  RecentInstancesResponse,
} from "@/api/typesGenerated";
import { getInstanceCategory } from "@/pages/Logs/utils/instanceImages";
import { parseColor, parseHexColor } from "@/pages/Instance/parseColors";
import { RaidCard } from "@/pages/Recent/RaidCard";
import { groupDuplicateInstances } from "@/utils/groupDuplicates";
import { DuplicateInstanceModal } from "@/components/DuplicateInstanceModal";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import { instanceAccentGradient } from "./instanceColors";
import { formatClearDuration } from "./clearTimeUtils";

type CategoryFilter = "all" | "raid" | "dungeon";

interface RecentRaidsConfig {
  displayMode: "cards" | "list";
  limit: number;
  category: CategoryFilter;
  hasVideo: "all" | "with";
  showParses: boolean;
}

function runID(instance: RecentInstance): string {
  return instance.duplicate_group_id ?? instance.id;
}

function formatRaidDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "3h 12m" style clear time for the meta line. */
function formatRaidDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "12 bosses" or "9 bosses killed + 6 attempts" when some pulls didn't end in a kill. */
function formatBosses(instance: RecentInstance): string {
  const kills = instance.boss_kills;
  const attempts = Math.max(0, instance.boss_count - kills);
  const bosses = `${kills} ${kills === 1 ? "boss" : "bosses"}`;
  if (attempts === 0) return bosses;
  return `${bosses} killed + ${attempts} ${attempts === 1 ? "attempt" : "attempts"}`;
}

/** Weighted average across encounters (weights are per-encounter parse counts). */
function weightedRunAverage(encounters: GuildRunEncounterParse[]): number | undefined {
  let sum = 0;
  let count = 0;
  for (const e of encounters) {
    sum += e.avg_parse * e.parse_count;
    count += e.parse_count;
  }
  return count > 0 ? sum / count : undefined;
}

/** One encounter inside an expanded raid row: name, parse, bar, kill time. */
function EncounterCard({ encounter }: { encounter: GuildRunEncounterParse }) {
  const score = Math.round(encounter.avg_parse);
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-foreground">{encounter.encounter_name}</p>
        <span className={`text-sm font-bold tabular-nums ${parseColor(score)}`}>{score}</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-border/60">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(2, Math.min(100, score))}%`,
            background: parseHexColor(score),
          }}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground tabular-nums">
        {encounter.kill_duration_ms > 0
          ? `Killed in ${formatClearDuration(encounter.kill_duration_ms)}`
          : "Kill time unknown"}
      </p>
    </div>
  );
}

/** One raid night as a compact row: name, meta line, per-boss parse bars, guild
 * avg parse. Clicking the row expands per-encounter details; the log itself is
 * reached via the explicit button. */
function RaidListRow({
  instance,
  encounters,
}: {
  instance: RecentInstance;
  encounters: GuildRunEncounterParse[];
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = [
    instance.player_count,
    formatRaidDate(instance.first_encounter_time),
    formatBosses(instance),
    instance.duration_ms ? formatRaidDuration(instance.duration_ms) : null,
  ]
    .filter((part) => part !== null && part !== "")
    .join(" · ");

  const avgParse = weightedRunAverage(encounters);
  const score = avgParse !== undefined ? Math.round(avgParse) : undefined;
  const instanceUrl = instance.slug ? `/instances/${instance.slug}` : `/instances/${instance.id}`;
  const expandable = encounters.length > 0;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-card hover:border-border transition-colors">
      <span
        className="absolute inset-y-0 left-0 w-[5px]"
        style={{ background: instanceAccentGradient(instance.name) }}
      />
      <div
        className={`flex items-center gap-4 pl-4 pr-3 py-2.5 ${expandable ? "cursor-pointer" : ""}`}
        onClick={() => expandable && setExpanded(!expanded)}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {instance.name}
            {instance.difficulty_name && instance.difficulty_name !== "Normal" && (
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                {instance.difficulty_name}
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground tabular-nums">{meta}</p>
        </div>
        {!expanded && encounters.length > 0 && (
          <span className="hidden sm:flex h-7 items-end gap-[2px]" aria-hidden>
            {encounters.map((e) => {
              const s = Math.round(e.avg_parse);
              return (
                <span
                  key={e.encounter_name}
                  className="w-1 rounded-[1px]"
                  style={{
                    height: `${Math.max(15, Math.min(100, s))}%`,
                    background: parseHexColor(s),
                    opacity: 0.75,
                  }}
                  title={`${e.encounter_name} · ${s}`}
                />
              );
            })}
          </span>
        )}
        {score !== undefined && (
          <span
            className={`min-w-9 text-right text-2xl font-bold tabular-nums ${parseColor(score)}`}
            title="Average guild parse for this raid"
          >
            {score}
          </span>
        )}
        <Link
          to={instanceUrl}
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          Log
          <ExternalLink className="h-3 w-3" />
        </Link>
        {expandable && (
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </div>
      {expanded && (
        <div className="border-t border-border/50 px-4 py-3">
          <p className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Per boss · guild avg parse
          </p>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
          >
            {encounters.map((encounter) => (
              <EncounterCard key={encounter.encounter_name} encounter={encounter} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecentRaidsContent({ config, position, guild }: GuildPanelRenderProps<RecentRaidsConfig>) {
  // Derive columns from panel grid width (1-12 columns)
  const cols = position.w >= 9 ? 3 : position.w >= 6 ? 2 : 1;
  const [instances, setInstances] = useState<RecentInstance[]>([]);
  const [runParses, setRunParses] = useState<Record<string, GuildRunEncounterParse[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const displayMode = config.displayMode === "list" ? "list" : "cards";
  const limit = config.limit || 5;
  const category = config.category || "all";
  const hasVideo = config.hasVideo === "with";
  // Panels saved before the toggle existed have no key; treat missing as enabled.
  const showParses = config.showParses !== false;

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

  // Both modes show the guild's average parse per raid night.
  const runIDs = useMemo(() => {
    if (!showParses) return "";
    return [...new Set(groups.map((group) => runID(group[0])))].join(",");
  }, [showParses, groups]);

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
        const byRun: Record<string, GuildRunEncounterParse[]> = {};
        for (const encounter of data.encounters ?? []) {
          (byRun[encounter.run_id] ??= []).push(encounter);
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
            encounters={showParses ? (runParses[runID(group[0])] ?? []) : []}
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
        <DuplicateAwareRaidCard
          key={group[0].id}
          group={group}
          parseScore={showParses ? weightedRunAverage(runParses[runID(group[0])] ?? []) : undefined}
        />
      ))}
    </div>
  );
}

function DuplicateAwareRaidCard({
  group,
  parseScore,
}: {
  group: RecentInstance[];
  parseScore?: number;
}) {
  const [showModal, setShowModal] = useState(false);

  if (group.length === 1) {
    return <RaidCard instance={group[0]} parseScore={parseScore} />;
  }

  return (
    <>
      <div className="relative cursor-pointer" onClick={(e) => { e.preventDefault(); setShowModal(true); }}>
        <RaidCard instance={group[0]} parseScore={parseScore} />
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
    {
      name: "showParses",
      label: "Show parse scores",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    displayMode: "cards",
    limit: 6,
    category: "all",
    hasVideo: "all",
    showParses: true,
  },
  render: (props) => <RecentRaidsContent {...props} />,
};
