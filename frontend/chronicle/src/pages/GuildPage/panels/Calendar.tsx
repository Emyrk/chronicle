/* eslint-disable react-refresh/only-export-components -- Panel registry files export a definition alongside their render components. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, AlertCircle, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import type { RecentInstance, RecentInstancesResponse } from "@/api/typesGenerated";
import { getInstanceBackground, getInstanceAbbrev } from "@/pages/Logs/utils/instanceImages";
import { getInstanceCategory } from "@/pages/Logs/utils/instanceCategory";
import { useSupportedInstances } from "@/api/queries";
import { LogsCalendar } from "@/pages/Logs/components/LogsCalendar";
import { groupDuplicateInstances } from "@/utils/groupDuplicates";
import { DuplicateInstanceModal } from "@/components/DuplicateInstanceModal";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import { instancePillStyle } from "./instanceColors";

type CategoryFilter = "all" | "raid" | "dungeon";

interface CalendarConfig {
  displayStyle: "cards" | "minimal";
  category: CategoryFilter;
  hasVideo: "all" | "with";
}


// Group instances by date key (yyyy-MM-dd)
function groupByDate(instances: RecentInstance[]): Record<string, RecentInstance[]> {
  const result: Record<string, RecentInstance[]> = {};
  for (const inst of instances) {
    const date = inst.first_encounter_time || inst.uploaded_at;
    if (!date) continue;
    const key = format(new Date(date), "yyyy-MM-dd");
    if (!result[key]) result[key] = [];
    result[key].push(inst);
  }
  return result;
}

// Compact card for a single instance (or duplicate group) inside a calendar day cell
function InstanceDayCard({
  group,
  compact,
  dense,
  fill,
  minimal,
}: {
  group: RecentInstance[];
  compact: boolean;
  dense: boolean;
  fill: boolean;
  minimal: boolean;
}) {
  const [imageError, setImageError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const instance = group[0];
  const isDuplicate = group.length > 1;
  const backgroundImage = getInstanceBackground(instance.name);
  const abbrev = getInstanceAbbrev(instance.name);
  const instanceUrl = instance.slug
    ? `/instances/${instance.slug}`
    : `/instances/${instance.id}`;

  const card = minimal ? (
    <div
      className={`flex items-center rounded px-1.5 ${compact ? "py-0 text-[9px]" : "py-0.5 text-[10px]"} font-semibold transition-all hover:brightness-125`}
      style={instancePillStyle(instance.name)}
    >
      <span className="truncate">
        {compact ? abbrev : (
          <>
            <span className="sm:hidden">{abbrev}</span>
            <span className="hidden sm:inline">{instance.name}</span>
          </>
        )}
      </span>
      {isDuplicate && <span className="ml-auto pl-1 opacity-80">×{group.length}</span>}
    </div>
  ) : (
    <div className={`relative overflow-hidden rounded group cursor-pointer transition-[filter,box-shadow] hover:brightness-110 hover:shadow-md ${fill ? "h-full" : compact ? "h-6" : dense ? "h-5" : "h-8 sm:h-10"}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-800" />
      {!imageError && (
        <img
          src={backgroundImage}
          alt=""
          onError={() => setImageError(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          style={{ objectPosition: "center 35%" }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/40" />
      <div className="relative z-10 h-full flex items-center px-1.5">
        <span className={`${compact ? "text-[9px]" : "text-[10px] sm:text-xs"} font-medium text-white truncate drop-shadow-lg group-hover:text-amber-300 transition-colors`}>
          {compact ? (
            abbrev
          ) : (
            <>
              <span className="sm:hidden">{abbrev}</span>
              <span className="hidden sm:inline">{instance.name}</span>
            </>
          )}
        </span>
        {isDuplicate && (
          <span className="ml-auto flex items-center gap-0.5 text-[9px] text-white/70 bg-black/50 px-1 py-0.5 rounded flex-shrink-0">
            <Copy className="h-2.5 w-2.5" />
            {group.length}
          </span>
        )}
      </div>
    </div>
  );

  if (isDuplicate) {
    return (
      <>
        <button className={`block w-full text-left ${fill ? "h-full" : ""}`} onClick={() => setShowModal(true)}>
          {card}
        </button>
        {showModal && (
          <DuplicateInstanceModal
            instances={group}
            onClose={() => setShowModal(false)}
          />
        )}
      </>
    );
  }

  return <Link to={instanceUrl} className={`block ${fill ? "h-full" : ""}`}>{card}</Link>;
}

function ExpandableDayCell({
  instances,
  compact,
  dense,
  minimal,
}: {
  instances: RecentInstance[];
  compact: boolean;
  dense: boolean;
  minimal: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxShown = compact ? 1 : 3;

  const groups = useMemo(() => groupDuplicateInstances(instances), [instances]);

  if (groups.length === 0) return null;

  const shown = expanded ? groups : groups.slice(0, maxShown);
  const remaining = groups.length - maxShown;
  const fillSingleCard = groups.length === 1 && !minimal;

  return (
    <div className={fillSingleCard ? "h-full" : dense ? "space-y-0.5" : "space-y-1"}>
      {shown.map((group) => (
        <InstanceDayCard
          key={group[0].id}
          group={group}
          compact={compact}
          dense={dense}
          fill={fillSingleCard}
          minimal={minimal}
        />
      ))}
      {groups.length > maxShown && (
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-full text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded text-center transition-colors flex items-center justify-center gap-0.5 ${compact ? "text-[9px] px-1 py-0.5" : "text-[10px] px-1.5 py-1"}`}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              +{remaining} more
            </>
          )}
        </button>
      )}
    </div>
  );
}

function CalendarContent({ config, guild, position }: GuildPanelRenderProps<CalendarConfig>) {
  const [month, setMonth] = useState(() => new Date());
  const [instances, setInstances] = useState<RecentInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: supportedInstances } = useSupportedInstances();

  const compact = position.h <= 5;
  // The default six-row panel gives each day about 90px in six-week months.
  // Use shorter cards there so three raids remain visible without a cell scrollbar.
  const dense = position.h <= 6;

  const minimal = config.displayStyle === "minimal";
  const category = config.category || "all";
  const hasVideo = config.hasVideo === "with";

  const fetchInstances = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("start", startOfMonth(month).toISOString());
      params.set("end", endOfMonth(month).toISOString());
      if (guild.id) params.set("guild_id", guild.id);
      if (hasVideo) params.set("has_video", "true");

      const response = await fetch(`/api/v1/raidlogs/range?${params}`);
      if (!response.ok) throw new Error("Failed to fetch instances");
      const data = (await response.json()) as RecentInstancesResponse;
      setInstances([...(data.instances ?? [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [guild.id, hasVideo, month]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const filtered = useMemo(() => {
    if (category === "all") return instances;
    return instances.filter((inst) => getInstanceCategory(inst.name, supportedInstances) === category);
  }, [instances, category, supportedInstances]);

  const byDate = useMemo(() => groupByDate(filtered), [filtered]);

  const dayContent = useCallback(
    (date: Date) => {
      const key = format(date, "yyyy-MM-dd");
      const dayInstances = byDate[key];
      if (!dayInstances || dayInstances.length === 0) return null;

      return (
        <ExpandableDayCell
          instances={dayInstances}
          compact={compact}
          dense={dense}
          minimal={minimal}
        />
      );
    },
    [byDate, compact, dense, minimal]
  );

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
        <p className="text-xs">Failed to load instances</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 p-1">
      <LogsCalendar
        month={month}
        onMonthChange={setMonth}
        dayContent={dayContent}
        density={compact ? "compact" : "default"}
        variant={minimal ? "cells" : "bordered"}
        fillHeight
      />
    </div>
  );
}

export const CalendarPanel: GuildPanelDefinition<CalendarConfig> = {
  type: "calendar",
  label: "Calendar",
  icon: <CalendarDays className="h-4 w-4" />,
  description: "Monthly calendar view of raid activity",
  defaultSize: { w: 12, h: 6 },
  minSize: { w: 6, h: 4 },
  maxSize: { w: 12, h: 10 },
  configSchema: [
    {
      name: "displayStyle",
      label: "Display",
      type: "select",
      options: [
        { value: "cards", label: "Image cards" },
        { value: "minimal", label: "Minimal colored pills" },
      ],
      defaultValue: "cards",
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
    displayStyle: "cards",
    category: "all",
    hasVideo: "all",
  },
  render: (props) => <CalendarContent {...props} />,
};
