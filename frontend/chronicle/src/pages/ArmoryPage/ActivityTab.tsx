import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import type {
  ArmoryPlayer,
  RecentInstance,
  RecentInstancesResponse,
} from "@/api/typesGenerated";
import { LogsCalendar } from "@/pages/Logs/components/LogsCalendar";
import { formatDuration } from "@/pages/Logs/utils/calendarUtils";
import {
  getInstanceBackground,
  getInstanceAbbrev,
} from "@/pages/Logs/utils/instanceImages";

interface ActivityTabProps {
  player: ArmoryPlayer;
}

function fetchActivity(
  realmId: string,
  playerGuid: string,
  start: Date,
  end: Date,
): Promise<RecentInstancesResponse> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    player_guid: playerGuid,
    realm_id: realmId,
  });
  return fetch(`/api/v1/raidlogs/range?${params}`).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch activity: ${r.status}`);
    return r.json();
  });
}

export function ActivityTab({ player }: ActivityTabProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  // Fetch a 3-month window around the current month for smoother navigation
  const start = useMemo(() => subMonths(startOfMonth(month), 1), [month]);
  const end = useMemo(() => addMonths(endOfMonth(month), 1), [month]);

  const { data, isLoading } = useQuery({
    queryKey: [
      "armory-activity",
      player.realm_id,
      player.id,
      start.toISOString(),
      end.toISOString(),
    ],
    queryFn: () => fetchActivity(player.realm_id, player.id, start, end),
    staleTime: 60_000,
  });

  // Group instances by date
  const instancesByDate = useMemo(() => {
    const map = new Map<string, RecentInstance[]>();
    if (!data?.instances) return map;
    for (const inst of data.instances) {
      const date = new Date(inst.first_encounter_time);
      const key = format(date, "yyyy-MM-dd");
      const arr = map.get(key);
      if (arr) {
        arr.push(inst);
      } else {
        map.set(key, [inst]);
      }
    }
    return map;
  }, [data]);

  const dayContent = (date: Date) => {
    const key = format(date, "yyyy-MM-dd");
    const instances = instancesByDate.get(key);
    if (!instances?.length) return null;
    return (
      <>
        {instances.map((inst) => (
          <ActivityDayCard key={inst.id} instance={inst} />
        ))}
      </>
    );
  };

  return (
    <div>
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground text-sm">
            Loading activity…
          </div>
        </div>
      )}
      {!isLoading && (
        <LogsCalendar
          month={month}
          onMonthChange={setMonth}
          dayContent={dayContent}
        />
      )}
      {!isLoading && data && data.instances.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">
          No raid activity found for this month.
        </div>
      )}
    </div>
  );
}

function ActivityDayCard({ instance }: { instance: RecentInstance }) {
  const url = instance.slug
    ? `/instances/${instance.slug}`
    : `/instances/${instance.id}`;
  const abbrev = getInstanceAbbrev(instance.name);
  const duration = formatDuration(instance.duration_ms);
  const bossProgress =
    instance.boss_count > 0
      ? `${instance.boss_kills}/${instance.boss_count}`
      : null;

  return (
    <Link to={url} className="block">
      <div className="relative h-10 sm:h-12 rounded overflow-hidden group cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-800" />
        <InstanceBg name={instance.name} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/40" />
        <div className="relative z-10 h-full flex items-center justify-between px-2">
          <span className="text-xs font-medium text-white truncate drop-shadow-lg group-hover:text-amber-300 transition-colors">
            <span className="sm:hidden">{abbrev}</span>
            <span className="hidden sm:inline">{instance.name}</span>
          </span>
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            {bossProgress && (
              <span className="text-[10px] text-white/80 bg-black/40 px-1.5 py-0.5 rounded">
                {bossProgress}
              </span>
            )}
            {duration && (
              <span className="text-[10px] text-white/80 bg-black/40 px-1.5 py-0.5 rounded">
                {duration}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function InstanceBg({ name }: { name: string }) {
  const [error, setError] = useState(false);
  const src = getInstanceBackground(name);
  if (error) return null;
  return (
    <img
      src={src}
      alt=""
      onError={() => setError(true)}
      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      style={{ objectPosition: "center 35%" }}
    />
  );
}
