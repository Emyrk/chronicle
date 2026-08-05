import { useEffect, useMemo, useState } from "react";
import { Trophy, AlertCircle } from "lucide-react";
import type { GuildEncounterKill, GuildEncounterKillsResponse } from "@/api/typesGenerated";
import { useSupportedInstanceBossCounts } from "@/api/queries";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface ProgressConfig {
  showKillCounts: boolean;
}

interface RaidProgress {
  instanceName: string;
  difficultyName: string;
  maxPlayers: number;
  encountersDown: number;
  kills: number;
  lastKilledAt: string;
}

/** Groups per-encounter kills into per-raid progression, most recent activity first. */
function groupProgress(encounters: GuildEncounterKill[]): RaidProgress[] {
  const byRaid = new Map<string, RaidProgress>();
  for (const e of encounters) {
    const key = `${e.instance_name}|${e.difficulty_name}|${e.max_players}`;
    const raid = byRaid.get(key);
    if (raid) {
      raid.encountersDown += 1;
      raid.kills += e.kills;
      if (e.last_killed_at > raid.lastKilledAt) raid.lastKilledAt = e.last_killed_at;
    } else {
      byRaid.set(key, {
        instanceName: e.instance_name,
        difficultyName: e.difficulty_name,
        maxPlayers: e.max_players,
        encountersDown: 1,
        kills: e.kills,
        lastKilledAt: e.last_killed_at,
      });
    }
  }
  return [...byRaid.values()].sort((a, b) => b.lastKilledAt.localeCompare(a.lastKilledAt));
}

function RaidRow({
  raid,
  total,
  showKillCounts,
}: {
  raid: RaidProgress;
  total: number;
  showKillCounts: boolean;
}) {
  const complete = raid.encountersDown === total;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-foreground">{raid.instanceName}</p>
        <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
          {raid.encountersDown} / {total}
        </p>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className="h-2 flex-1 rounded-xs"
            style={{
              background:
                i < raid.encountersDown
                  ? complete
                    ? "var(--color-amber-500)"
                    : "var(--color-green-400)"
                  : "var(--border)",
            }}
          />
        ))}
      </div>
      {showKillCounts && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {[
            raid.maxPlayers > 0 ? `${raid.maxPlayers}-player` : "",
            raid.difficultyName !== "Normal" ? raid.difficultyName : "",
            `${raid.kills} boss ${raid.kills === 1 ? "kill" : "kills"} logged`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function ProgressContent({ config, position, guild }: GuildPanelRenderProps<ProgressConfig>) {
  const [encounters, setEncounters] = useState<GuildEncounterKill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: bossCounts } = useSupportedInstanceBossCounts();

  useEffect(() => {
    let cancelled = false;
    const fetchEncounters = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/guilds/${guild.id}/encounters`);
        if (!response.ok) throw new Error("Failed to fetch guild encounters");
        const data = (await response.json()) as GuildEncounterKillsResponse;
        if (!cancelled) setEncounters([...(data.encounters ?? [])]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchEncounters();
    return () => {
      cancelled = true;
    };
  }, [guild.id]);

  const progress = useMemo(() => groupProgress(encounters), [encounters]);

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
        <p className="text-xs">Failed to load progression</p>
      </div>
    );
  }

  if (progress.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm">No boss kills recorded yet</p>
      </div>
    );
  }

  // Two columns of raids when the panel is wide enough.
  const cols = position.w >= 8 ? 2 : 1;

  return (
    <div
      className="grid gap-x-6 gap-y-4 content-start p-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {progress.map((raid) => (
        <RaidRow
          key={`${raid.instanceName}|${raid.difficultyName}|${raid.maxPlayers}`}
          raid={raid}
          total={Math.max(bossCounts?.get(raid.instanceName) ?? raid.encountersDown, raid.encountersDown)}
          showKillCounts={config.showKillCounts !== false}
        />
      ))}
    </div>
  );
}

export const ProgressPanel: GuildPanelDefinition<ProgressConfig> = {
  type: "progress",
  label: "Progression",
  icon: <Trophy className="h-4 w-4" />,
  description: "Bosses the guild has defeated in each raid",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 10 },
  configSchema: [
    {
      name: "showKillCounts",
      label: "Show kill counts",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    showKillCounts: true,
  },
  render: (props) => <ProgressContent {...props} />,
};
