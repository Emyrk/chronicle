/* eslint-disable react-refresh/only-export-components -- Panel registry files export a definition alongside their render components. */
import { useEffect, useMemo, useState } from "react";
import { Trophy, AlertCircle, Skull } from "lucide-react";
import type { GuildEncounterKill, GuildEncounterKillsResponse } from "@/api/typesGenerated";
import { useSupportedInstanceBossCounts } from "@/api/queries";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { getInstanceCategory, getInstanceContentLevel } from "@/pages/Logs/utils/instanceImages";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

type CategoryFilter = "all" | "raid" | "dungeon";
type ContentLevelFilter = "all" | "60" | "70" | "80";
type ProgressMode = "detail" | "compact";

interface ProgressConfig {
  mode: ProgressMode;
  category: CategoryFilter;
  contentLevel: ContentLevelFilter;
  showKillCounts: boolean;
}

/** One size/difficulty lockout of a raid, e.g. "25-player Heroic". */
interface VariantProgress {
  difficultyName: string;
  maxPlayers: number;
  heroic: boolean;
  encountersDown: number;
  kills: number;
  /** Player deaths across all runs of this variant; undefined when no run metrics exist. */
  deaths?: number;
  lastKilledAt: string;
}

/** A raid with every size/difficulty variant nested under it. */
interface RaidProgress {
  instanceName: string;
  variants: VariantProgress[];
  lastKilledAt: string;
}

/**
 * Groups per-encounter kills into per-raid progression, most recent activity
 * first. Every size/difficulty combination is a lockout of the same raid, so
 * it nests as a variant under that raid rather than repeating the name.
 */
function groupProgress(
  encounters: GuildEncounterKill[],
  deathsByVariant: Map<string, number>,
): RaidProgress[] {
  const byVariant = new Map<string, VariantProgress & { instanceName: string }>();
  for (const e of encounters) {
    const key = `${e.instance_name}|${e.difficulty_name}|${e.max_players}`;
    const variant = byVariant.get(key);
    if (variant) {
      variant.encountersDown += 1;
      variant.kills += e.kills;
      if (e.last_killed_at > variant.lastKilledAt) variant.lastKilledAt = e.last_killed_at;
    } else {
      byVariant.set(key, {
        instanceName: e.instance_name,
        difficultyName: e.difficulty_name,
        maxPlayers: e.max_players,
        heroic: e.difficulty_name.includes("Heroic"),
        encountersDown: 1,
        kills: e.kills,
        deaths: deathsByVariant.get(key),
        lastKilledAt: e.last_killed_at,
      });
    }
  }

  const byRaid = new Map<string, RaidProgress>();
  for (const { instanceName, ...variant } of byVariant.values()) {
    const raid = byRaid.get(instanceName);
    if (raid) {
      raid.variants.push(variant);
      if (variant.lastKilledAt > raid.lastKilledAt) raid.lastKilledAt = variant.lastKilledAt;
    } else {
      byRaid.set(instanceName, {
        instanceName,
        variants: [variant],
        lastKilledAt: variant.lastKilledAt,
      });
    }
  }

  for (const raid of byRaid.values()) {
    raid.variants.sort(
      (a, b) => b.maxPlayers - a.maxPlayers || Number(b.heroic) - Number(a.heroic),
    );
  }
  return [...byRaid.values()].sort((a, b) => b.lastKilledAt.localeCompare(a.lastKilledAt));
}

/** Short lockout label, e.g. "40", "10 HC". Empty when there is no size and no heroic mode. */
function variantLabel(variant: VariantProgress): string {
  const parts = [];
  if (variant.maxPlayers > 0) parts.push(String(variant.maxPlayers));
  if (variant.heroic) parts.push("HC");
  return parts.join(" ");
}

function totalFor(bossCounts: Map<string, number> | undefined, raid: RaidProgress) {
  const known = bossCounts?.get(raid.instanceName) ?? 0;
  return Math.max(known, ...raid.variants.map((v) => v.encountersDown));
}

function VariantChip({ variant, complete }: { variant: VariantProgress; complete: boolean }) {
  const label = variantLabel(variant);
  if (!label) return null;
  return (
    <span
      className={cn(
        "min-w-11 rounded border px-1.5 py-px text-center font-mono text-[10px] whitespace-nowrap",
        variant.heroic
          ? "border-purple-500/40 text-purple-400"
          : complete
            ? "border-amber-500/40 text-amber-500"
            : "border-border text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function KillPips({ variant, total }: { variant: VariantProgress; total: number }) {
  const complete = variant.encountersDown === total;
  const killColor = variant.heroic
    ? "var(--color-purple-500)"
    : complete
      ? "var(--color-amber-500)"
      : "var(--color-green-400)";
  return (
    <div className="flex min-w-0 flex-1 gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="h-2 flex-1 rounded-xs"
          style={{ background: i < variant.encountersDown ? killColor : "var(--border)" }}
        />
      ))}
    </div>
  );
}

function KillCount({ kills, deaths }: { kills: number; deaths?: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
      <HintTooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-0.5">
            <Skull className="h-3 w-3" />
            {kills}
          </span>
        </TooltipTrigger>
        <TooltipContent>Bosses killed</TooltipContent>
      </HintTooltip>
      {deaths !== undefined && (
        <>
          <span className="text-border">|</span>
          <HintTooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <span>{deaths}</span>
            </TooltipTrigger>
            <TooltipContent>Player deaths</TooltipContent>
          </HintTooltip>
        </>
      )}
    </span>
  );
}

function VariantRow({
  variant,
  total,
  showKillCounts,
}: {
  variant: VariantProgress;
  total: number;
  showKillCounts: boolean;
}) {
  const complete = variant.encountersDown === total;
  return (
    <div className="flex items-center gap-x-2.5">
      <VariantChip variant={variant} complete={complete} />
      <KillPips variant={variant} total={total} />
      {showKillCounts && <KillCount kills={variant.kills} deaths={variant.deaths} />}
      <p
        className={cn(
          "text-sm font-bold tabular-nums whitespace-nowrap",
          complete ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {variant.encountersDown} / {total}
      </p>
    </div>
  );
}

function DetailRaid({
  raid,
  total,
  showKillCounts,
}: {
  raid: RaidProgress;
  total: number;
  showKillCounts: boolean;
}) {
  // A raid with a single lockout type needs no section header — the raid name
  // and the variant collapse into one row.
  if (raid.variants.length === 1) {
    const variant = raid.variants[0];
    const complete = variant.encountersDown === total;
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="min-w-0 truncate text-sm text-foreground">{raid.instanceName}</p>
            <VariantChip variant={variant} complete={complete} />
          </div>
          <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
            {variant.encountersDown} / {total}
          </p>
        </div>
        <div className="flex items-center gap-x-2.5">
          <KillPips variant={variant} total={total} />
          {showKillCounts && <KillCount kills={variant.kills} deaths={variant.deaths} />}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 border-b border-border/50 pb-1.5">
        <p className="min-w-0 truncate text-sm text-foreground">{raid.instanceName}</p>
      </div>
      <div className="flex flex-col gap-2">
        {raid.variants.map((variant) => (
          <VariantRow
            key={`${variant.difficultyName}|${variant.maxPlayers}`}
            variant={variant}
            total={total}
            showKillCounts={showKillCounts}
          />
        ))}
      </div>
    </div>
  );
}

/** Compact: no pips, no notes — the whole raid collapses to one line of variant pills. */
function CompactRaid({ raid, total }: { raid: RaidProgress; total: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/50 py-1.5">
      <p className="min-w-0 flex-1 truncate text-sm text-foreground">{raid.instanceName}</p>
      <div className="flex flex-wrap justify-end gap-1">
        {raid.variants.map((variant) => {
          const complete = variant.encountersDown === total;
          const label = variantLabel(variant);
          return (
            <span
              key={`${variant.difficultyName}|${variant.maxPlayers}`}
              className={cn(
                "flex items-baseline gap-1.5 rounded border px-1.5 py-0.5 whitespace-nowrap",
                complete ? "border-amber-500/40 bg-amber-500/10" : "border-border",
              )}
            >
              {label && (
                <span
                  className={cn(
                    "font-mono text-[9px]",
                    variant.heroic ? "text-purple-400" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              )}
              <span
                className={cn(
                  "text-xs font-bold tabular-nums",
                  complete ? "text-amber-500" : "text-foreground",
                )}
              >
                {variant.encountersDown}/{total}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ProgressContent({ config, position, guild }: GuildPanelRenderProps<ProgressConfig>) {
  const [encounters, setEncounters] = useState<GuildEncounterKill[]>([]);
  const [deathsByVariant, setDeathsByVariant] = useState<Map<string, number>>(new Map());
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
        if (!cancelled) {
          setEncounters([...(data.encounters ?? [])]);
          setDeathsByVariant(
            new Map(
              (data.instance_deaths ?? []).map((d) => [
                `${d.instance_name}|${d.difficulty_name}|${d.max_players}`,
                d.deaths,
              ]),
            ),
          );
        }
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

  const progress = useMemo(() => {
    const category = config.category ?? "all";
    const contentLevel = config.contentLevel ?? "all";
    const filtered = encounters.filter((e) => {
      const instanceCategory = getInstanceCategory(e.instance_name);
      const matchesCategory =
        category === "all" ||
        (category === "dungeon" ? instanceCategory !== "raid" : instanceCategory === "raid");
      const matchesContentLevel =
        contentLevel === "all" ||
        getInstanceContentLevel(e.instance_name, e.max_players) === Number(contentLevel);
      return matchesCategory && matchesContentLevel;
    });
    return groupProgress(filtered, deathsByVariant);
  }, [config.category, config.contentLevel, encounters, deathsByVariant]);

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

  if ((config.mode ?? "detail") === "compact") {
    return (
      <div
        className="grid gap-x-6 content-start p-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {progress.map((raid) => (
          <CompactRaid key={raid.instanceName} raid={raid} total={totalFor(bossCounts, raid)} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid gap-x-6 gap-y-4 content-start p-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {progress.map((raid) => (
        <DetailRaid
          key={raid.instanceName}
          raid={raid}
          total={totalFor(bossCounts, raid)}
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
  description: "Bosses the guild has defeated in raids and dungeons",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 10 },
  configSchema: [
    {
      name: "mode",
      label: "Display mode",
      type: "select",
      options: [
        { value: "detail", label: "Detail" },
        { value: "compact", label: "Compact" },
      ],
      defaultValue: "detail",
    },
    {
      name: "category",
      label: "Category",
      type: "select",
      options: [
        { value: "all", label: "All" },
        { value: "raid", label: "Raids" },
        { value: "dungeon", label: "Dungeons" },
      ],
      defaultValue: "all",
    },
    {
      name: "contentLevel",
      label: "Content level",
      type: "select",
      options: [
        { value: "all", label: "All" },
        { value: "60", label: "Level 60" },
        { value: "70", label: "Level 70" },
        { value: "80", label: "Level 80" },
      ],
      defaultValue: "all",
    },
    {
      name: "showKillCounts",
      label: "Show kill counts",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    mode: "detail",
    category: "all",
    contentLevel: "all",
    showKillCounts: true,
  },
  render: (props) => <ProgressContent {...props} />,
};
