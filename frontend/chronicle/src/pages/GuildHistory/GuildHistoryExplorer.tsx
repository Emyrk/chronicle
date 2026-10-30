import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Eye, EyeOff, List, LockKeyhole, Map, Plus, Search, Settings2, Shield, Star, Timer, Trash2 } from "lucide-react";
import type { FavoriteGuild, GuildInfo, GuildSpeedrunRun } from "@/api/typesGenerated";
import { useGuildSearch, useMyFavorites, useSession } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/Card/Card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import { performanceParseColor } from "@/pages/ArmoryPage/overview/performanceExplorerModel";
import { SummaryViewToggle, type SummaryView } from "@/pages/ArmoryPage/overview/PerformanceSummary";
import { difficultyLabel } from "@/pages/Leaderboards/Parsing/spreadBands";
import { isPaidBillingTier, TIER_COLOR } from "@/pages/Settings/billingPricing";
import { BossFocusCombobox } from "./BossFocusCombobox";
import { BossSplits } from "./BossSplits";
import { ClearTimeChart } from "./ClearTimeChart";
import { GuildClearSummary } from "./GuildClearSummary";
import {
  filterGuildRuns,
  formatClearTime,
  GUILD_SERIES_COLORS,
  mergeBossOrder,
  parsesAvailable,
  summarizeBossSplits,
  summarizeClearTimes,
} from "./guildHistoryModel";
import { useGuildInfos, useGuildRaidClearsList, useGuildSpeedrunHistories } from "./guildHistoryQueries";
import {
  GUILD_HISTORY_RANGE_DAYS,
  type GuildHistoryDateRange,
  type GuildHistoryState,
  type GuildHistoryTab,
  type GuildHistoryTiming,
} from "./guildHistoryState";

const MAX_COMPARISON_GUILDS = 5;
/** Friendly and signed-out viewers analyze one guild at a time; comparing is a supporter perk. */
const FREE_COMPARISON_GUILDS = 1;

function useGuildComparisonLimit() {
  const session = useSession();
  // Assume the full limit while loading so supporters' shared links never flash trimmed.
  if (session.isLoading || isPaidBillingTier(session.data?.supporter_tier ?? "")) return MAX_COMPARISON_GUILDS;
  return FREE_COMPARISON_GUILDS;
}

const DETAIL_TABS: readonly { value: GuildHistoryTab; label: string; icon: typeof List }[] = [
  { value: "bosses", label: "Boss splits", icon: Timer },
  { value: "runs", label: "Clears", icon: List },
];

const TIMINGS: readonly { value: GuildHistoryTiming; label: string; help: string }[] = [
  { value: "full", label: "Full clear", help: "First pull to the last boss kill, as ranked on the speedrun leaderboard." },
  { value: "boss", label: "Boss to boss", help: "First boss pull to the last boss kill, ignoring the trash before the first boss." },
];

interface SelectedGuild {
  id: string;
  name: string;
  realmName: string;
  logoUrl: string;
  color: string;
  hidden: boolean;
  runs: GuildSpeedrunRun[];
}

export function GuildHistoryExplorer({
  state,
  onStateChange,
}: {
  state: GuildHistoryState;
  onStateChange: (state: GuildHistoryState) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [configGuildId, setConfigGuildId] = useState<string | null>(null);
  const [summaryView, setSummaryView] = useState<SummaryView>("numbers");
  const guildLimit = useGuildComparisonLimit();
  // Guilds past the limit stay in the URL, so the link still works for supporters, but are not loaded.
  const guildIds = state.guildIds.slice(0, guildLimit);
  const lockedGuilds = state.guildIds.length - guildIds.length;
  const infoQueries = useGuildInfos(guildIds);
  const clearsQueries = useGuildRaidClearsList(guildIds);
  const raids = raidOptions(clearsQueries.flatMap((query) => query.data?.clears ?? []));
  const selectedRaid = selectRaid(raids, state.instanceName, state.difficultyName, state.maxPlayers, state.dynamicDifficulty);
  const instanceName = selectedRaid?.name;
  const difficultyName = selectedRaid?.difficultyName;
  const maxPlayers = selectedRaid?.maxPlayers;
  const dynamicDifficulty = selectedRaid?.dynamicDifficulty;
  const historyQueries = useGuildSpeedrunHistories(guildIds, instanceName, difficultyName, maxPlayers, dynamicDifficulty);
  const { timing, boss, part, dateRange, includeUnqualified, tab } = state;
  const focus = { boss, part };
  const canParse = parsesAvailable(timing, focus);
  // Parses exist only for whole clears and boss kills; anything else falls back to times.
  const display = canParse ? state.display : "time";

  const runsByGuild = guildIds.map((_, index) => filterGuildRuns(historyQueries[index]?.data?.runs ?? [], {
    includeUnqualified: true,
    rangeDays: GUILD_HISTORY_RANGE_DAYS[dateRange],
  }));
  const unqualifiedRunCount = runsByGuild.flat().filter((run) => !run.qualified).length;
  const guilds: SelectedGuild[] = guildIds.map((id, index) => {
    const info = infoQueries[index]?.data;
    return {
      id,
      name: info?.name ?? "Loading…",
      realmName: info?.realm_name ?? "",
      logoUrl: info?.logo_url ?? "",
      color: GUILD_SERIES_COLORS[index % GUILD_SERIES_COLORS.length],
      hidden: state.hiddenGuildIds.includes(id),
      runs: includeUnqualified ? runsByGuild[index] : runsByGuild[index].filter((run) => run.qualified),
    };
  });
  const visibleGuilds = guilds.filter((guild) => !guild.hidden);
  const showRealms = new Set(guilds.map((guild) => guild.realmName)).size > 1;
  const label = (guild: SelectedGuild) => showRealms && guild.realmName ? `${guild.name} · ${guild.realmName}` : guild.name;
  const summaryRows = visibleGuilds.map((guild) => ({
    id: guild.id,
    name: label(guild),
    color: guild.color,
    summary: summarizeClearTimes(guild.runs, timing, focus, display),
  }));
  const hasSummary = summaryRows.some((row) => row.summary !== null);
  const bossNames = mergeBossOrder(visibleGuilds.map((guild) => summarizeBossSplits(guild.runs)));
  const focusBoss = (next: string) => onStateChange({ ...state, boss: next, part: "" });
  const toggleHidden = (guildId: string) => onStateChange({
    ...state,
    hiddenGuildIds: state.hiddenGuildIds.includes(guildId)
      ? state.hiddenGuildIds.filter((id) => id !== guildId)
      : [...state.hiddenGuildIds, guildId],
  });
  const loading = historyQueries.some((query) => query.isLoading) || (!instanceName && clearsQueries.some((query) => query.isLoading));

  const addGuild = (guildId: string) => {
    if (guildIds.includes(guildId) || guildIds.length >= guildLimit) return;
    onStateChange({ ...state, guildIds: [...guildIds, guildId] });
    setAddOpen(false);
  };

  return (
    <Card className="overflow-hidden border-border/80 bg-gradient-to-b from-card to-card/70 py-3 sm:py-4">
      <CardContent className="space-y-4 px-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 pb-3">
          <h1 className="flex shrink-0 items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
            <Timer className="h-4 w-4 text-sky-400" />
            Guild Analysis
          </h1>
          <label className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
            <span className="sr-only">Raid</span>
            <Map className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sky-400" />
            <select
              value={selectedRaid ? raidOptionValue(selectedRaid) : ""}
              onChange={(event) => {
                const raid = raids.find((option) => raidOptionValue(option) === event.target.value);
                if (raid) {
                  onStateChange({
                    ...state,
                    instanceName: raid.name,
                    difficultyName: raid.difficultyName,
                    maxPlayers: raid.maxPlayers,
                    dynamicDifficulty: raid.dynamicDifficulty,
                    boss: "",
                    part: "",
                  });
                }
              }}
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground outline-none focus:border-sky-500/70"
            >
              {raids.length === 0 && <option value="">No clears yet</option>}
              {raids.map((raid) => (
                <option key={raidOptionValue(raid)} value={raidOptionValue(raid)}>
                  {raidLabel(raid)} ({raid.clears} {raid.clears === 1 ? "clear" : "clears"})
                </option>
              ))}
            </select>
          </label>
          <BossFocusCombobox
            bosses={bossNames}
            value={focus}
            onChange={(next) => onStateChange({ ...state, ...next })}
            className="min-w-0 basis-full sm:max-w-[15rem] sm:flex-1 sm:basis-auto"
          />
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <Segmented
              label="Time or parse"
              options={[
                { value: "time", label: "Time", title: "Clear and kill times. Lower is faster." },
                {
                  value: "parse",
                  label: "Parse",
                  title: canParse
                    ? "Time parses: how each clear or kill ranked against the server's in the 60 days before it. Higher is better."
                    : "Parses exist for full clears and boss kills only",
                  disabled: !canParse,
                },
              ] as const}
              value={display}
              onChange={(value) => onStateChange({ ...state, display: value })}
            />
            <Segmented
              label="Timing"
              disabled={!!boss || !!part || display === "parse"}
              options={TIMINGS.map(({ value, label: optionLabel, help }) => ({ value, label: optionLabel, title: help }))}
              value={timing}
              onChange={(value) => onStateChange({ ...state, timing: value })}
            />
            <Segmented
              label="Date range"
              options={(["180d", "60d", "30d"] as const).map((value) => ({ value, label: value }))}
              value={dateRange}
              onChange={(value: GuildHistoryDateRange) => onStateChange({ ...state, dateRange: value })}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
          {guilds.map((guild) => (
            <button
              key={guild.id}
              type="button"
              onClick={(event) => {
                if (event.shiftKey) toggleHidden(guild.id);
                else setConfigGuildId(guild.id);
              }}
              className={cn(
                "group flex h-8 min-w-0 items-center gap-2 rounded-md border border-border bg-background/70 pr-2 text-left text-xs transition-all hover:bg-accent/50 sm:min-w-40",
                guild.hidden && "opacity-45 saturate-50",
              )}
              style={{ borderColor: guild.color }}
              aria-label={`${guild.name}. ${guild.hidden ? "Hidden, Shift+click to show" : "Shift+click to hide"}`}
            >
              <GuildLogo url={guild.logoUrl} color={guild.color} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-semibold" style={{ color: guild.color }}>{guild.name}</span>
                {guild.realmName && <span className="block truncate text-[10px] text-muted-foreground">{guild.realmName}</span>}
              </span>
              {guild.hidden && <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <Settings2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
            </button>
          ))}
          {guildIds.length >= guildLimit && guildLimit < MAX_COMPARISON_GUILDS ? (
            <GuildComparisonUpsell lockedGuilds={lockedGuilds} />
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 min-w-0 px-3 text-xs"
              disabled={guildIds.length >= guildLimit}
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add guild
              <span className="text-[10px] text-muted-foreground/60">{guildIds.length}/{guildLimit}</span>
            </Button>
          )}
        </div>
          {!loading && hasSummary && <SummaryViewToggle view={summaryView} onChange={setSummaryView} className="shrink-0 self-end sm:self-start" />}
        </div>

        {!loading && (
          <GuildClearSummary
            rows={summaryRows}
            view={summaryView}
            countLabel={display === "parse" ? "Qualified parses" : boss ? "Qualified kills" : "Qualified clears"}
          />
        )}

        <ClearTimeChart
          series={visibleGuilds.map((guild) => ({ id: guild.id, name: label(guild), color: guild.color, runs: guild.runs }))}
          timing={timing}
          focus={focus}
          display={display}
          loading={loading}
          includeUnqualified={includeUnqualified}
          unqualifiedRunCount={unqualifiedRunCount}
          onIncludeUnqualifiedChange={(value) => onStateChange({ ...state, includeUnqualified: value })}
        />

        <div className="pt-2">
          <div role="tablist" aria-label="Details" className="flex gap-1 overflow-x-auto border-b border-border styled-scrollbar">
            {DETAIL_TABS.map(({ value, label: tabLabel, icon: Icon }) => {
              const active = tab === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onStateChange({ ...state, tab: value })}
                  className={cn(
                    "-mb-px flex shrink-0 items-center gap-2 rounded-t-lg border px-4 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "border-border border-b-transparent bg-white/[0.04] text-foreground shadow-[inset_0_2px_0_0_#5F8FA6]"
                      : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-sky-400")} />
                  {tabLabel}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" className="rounded-b-lg border border-t-0 border-border bg-white/[0.04] p-3 sm:p-4">
            {tab === "bosses" ? (
              <BossSplits
                guilds={visibleGuilds.map((guild) => ({ id: guild.id, name: label(guild), color: guild.color, runs: guild.runs }))}
                focusedBoss={boss}
                onFocusBoss={focusBoss}
              />
            ) : (
              <ClearsTable guilds={visibleGuilds} label={label} />
            )}
          </div>
        </div>
      </CardContent>

      <GuildSettingsDialog
        guild={guilds.find((guild) => guild.id === configGuildId)}
        onClose={() => setConfigGuildId(null)}
        onToggleHidden={toggleHidden}
        onRemove={(guildId) => {
          onStateChange({
            ...state,
            guildIds: state.guildIds.filter((id) => id !== guildId),
            hiddenGuildIds: state.hiddenGuildIds.filter((id) => id !== guildId),
          });
          setConfigGuildId(null);
        }}
      />
      <AddGuildDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        selectedIds={guildIds}
        onSelect={addGuild}
      />
    </Card>
  );
}

/** Raids any selected guild has cleared, with each recorded difficulty kept separate. */
interface RaidOption {
  name: string;
  difficultyName: string;
  maxPlayers: number;
  dynamicDifficulty: number;
  clears: number;
}

function raidOptions(clears: readonly {
  instance_name: string;
  difficulty_name: string;
  max_players: number;
  dynamic_difficulty: number;
  clear_count: number;
}[]): RaidOption[] {
  const totals = new globalThis.Map<string, RaidOption>();
  for (const clear of clears) {
    const option: RaidOption = {
      name: clear.instance_name,
      difficultyName: clear.difficulty_name,
      maxPlayers: clear.max_players,
      dynamicDifficulty: clear.dynamic_difficulty,
      clears: clear.clear_count,
    };
    const key = raidOptionValue(option);
    totals.set(key, { ...option, clears: (totals.get(key)?.clears ?? 0) + clear.clear_count });
  }
  return [...totals.values()]
    .sort((a, b) => b.clears - a.clears
      || a.name.localeCompare(b.name)
      || a.maxPlayers - b.maxPlayers
      || a.difficultyName.localeCompare(b.difficultyName)
      || a.dynamicDifficulty - b.dynamicDifficulty);
}

function selectRaid(
  raids: readonly RaidOption[],
  instanceName: string,
  difficultyName: string | null,
  maxPlayers: number | null,
  dynamicDifficulty: number | null,
): RaidOption | undefined {
  if (!instanceName) return raids[0];
  return raids.find((raid) => raid.name === instanceName
      && (difficultyName === null || raid.difficultyName === difficultyName)
      && (maxPlayers === null || raid.maxPlayers === maxPlayers)
      && (dynamicDifficulty === null || raid.dynamicDifficulty === dynamicDifficulty))
    ?? raids.find((raid) => raid.name === instanceName && (difficultyName === null || raid.difficultyName === difficultyName))
    ?? raids.find((raid) => raid.name === instanceName)
    ?? raids[0];
}

function raidOptionValue(raid: Pick<RaidOption, "name" | "difficultyName" | "maxPlayers" | "dynamicDifficulty">): string {
  return JSON.stringify([raid.name, raid.difficultyName, raid.maxPlayers, raid.dynamicDifficulty]);
}

function raidLabel(raid: Pick<RaidOption, "name" | "difficultyName" | "maxPlayers" | "dynamicDifficulty">): string {
  const board = difficultyLabel(raid.difficultyName, raid.maxPlayers);
  const mode = raid.dynamicDifficulty > 0 && !raid.difficultyName.toLowerCase().includes("heroic") ? "Heroic" : "";
  const details = [mode, board].filter(Boolean).join(" · ");
  return details ? `${raid.name} (${details})` : raid.name;
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: readonly { value: T; label: string; title?: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      aria-disabled={disabled}
      title={disabled ? "Only whole clear times have a choice of timing" : undefined}
      className={cn("flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1", disabled && "pointer-events-none opacity-40")}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          disabled={option.disabled}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            value === option.value ? "bg-white/15 text-foreground" : "text-muted-foreground enabled:hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function GuildLogo({ url, color }: { url: string; color: string }) {
  if (url) {
    return <img src={url} alt="" className="size-8 shrink-0 rounded-l-[5px] border-r object-cover" style={{ borderColor: color }} />;
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-l-[5px] border-r bg-white/5" style={{ borderColor: color }}>
      <Shield className="h-4 w-4" style={{ color }} />
    </span>
  );
}

function ClearsTable({ guilds, label }: { guilds: readonly SelectedGuild[]; label: (guild: SelectedGuild) => string }) {
  const rows = guilds
    .flatMap((guild) => guild.runs.map((run) => ({ guild, run })))
    .sort((a, b) => b.run.completion_time.localeCompare(a.run.completion_time));
  if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">No clears match these filters.</div>;

  return (
    <div className="max-h-[28rem] overflow-auto styled-scrollbar">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-3 py-2 text-left font-medium">Date</th>
            {guilds.length > 1 && <th className="px-3 py-2 text-left font-medium">Guild</th>}
            <th className="px-3 py-2 text-right font-medium">Full clear</th>
            <th className="px-3 py-2 text-right font-medium">Boss to boss</th>
            <th className="px-3 py-2 text-right font-medium" title="Server time parse: how the clear ranked against the server's in the 60 days before it">Parse</th>
            <th className="px-3 py-2 text-right font-medium">Bosses</th>
            <th className="px-3 py-2 text-right font-medium">Players</th>
            <th className="px-3 py-2 text-right font-medium"><span className="sr-only">Log</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ guild, run }) => (
            <tr
              key={`${guild.id}-${run.slug}`}
              className={cn(
                "border-b border-border/40 last:border-0",
                !run.complete && "bg-amber-500/[0.06] shadow-[inset_3px_0_0_0_rgb(252_211_77_/_0.75)]",
              )}
            >
              <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                {new Date(run.completion_time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                {!run.complete ? (
                  <span className="ml-2 rounded border border-amber-400/35 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">Incomplete</span>
                ) : !run.qualified ? (
                  <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">Unqualified</span>
                ) : null}
              </td>
              {guilds.length > 1 && (
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: guild.color }} />
                    <span className="font-medium">{label(guild)}</span>
                  </span>
                </td>
              )}
              <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">{formatClearTime(run.duration_ms)}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                {run.boss_to_boss_duration_ms > 0 ? formatClearTime(run.boss_to_boss_duration_ms) : "—"}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                {run.clear_parse === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span style={{ color: performanceParseColor(run.clear_parse) }}>{run.clear_parse.toFixed(1)}</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{run.bosses.length}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{run.player_count}</td>
              <td className="px-3 py-1.5 text-right">
                <Link
                  to={`/instances/${run.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                >
                  Log <ExternalLink className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Replaces "Add guild" for viewers at the free limit: comparing guilds is a supporter perk. */
function GuildComparisonUpsell({ lockedGuilds }: { lockedGuilds: number }) {
  return (
    <Link
      to="/supporter"
      target="_blank"
      rel="noopener noreferrer"
      className="col-span-2 flex h-8 min-w-0 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors hover:brightness-125 sm:col-span-1"
      style={{ borderColor: `${TIER_COLOR.honored}66`, backgroundColor: `${TIER_COLOR.honored}14` }}
    >
      <LockKeyhole className="h-3.5 w-3.5 shrink-0" style={{ color: TIER_COLOR.honored }} aria-hidden="true" />
      <span className="truncate">
        {lockedGuilds > 0
          ? `${lockedGuilds} more ${lockedGuilds === 1 ? "guild" : "guilds"} in this link. `
          : ""}
        <span className="font-medium" style={{ color: TIER_COLOR.honored }}>Honored</span>
        <span className="text-muted-foreground"> supporters compare up to {MAX_COMPARISON_GUILDS} guilds</span>
      </span>
    </Link>
  );
}

function GuildSettingsDialog({
  guild,
  onClose,
  onToggleHidden,
  onRemove,
}: {
  guild: SelectedGuild | undefined;
  onClose: () => void;
  onToggleHidden: (guildId: string) => void;
  onRemove: (guildId: string) => void;
}) {
  return (
    <Dialog open={!!guild} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        {guild && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: guild.color }} />
                <span style={{ color: guild.color }}>{guild.name}</span>
              </DialogTitle>
              {guild.realmName && <DialogDescription>{guild.realmName}</DialogDescription>}
            </DialogHeader>
            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => onToggleHidden(guild.id)}>
                {guild.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {guild.hidden ? "Show guild data" : "Hide guild data"}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => onRemove(guild.id)}>
                <Trash2 className="h-4 w-4" />
                Remove guild
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddGuildDialog({
  open,
  onOpenChange,
  selectedIds,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: readonly string[];
  onSelect: (guildId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const search = useGuildSearch({ search: debounced });
  const { isAuthenticated } = useAuth();
  const favorites = useMyFavorites({ enabled: isAuthenticated });
  const savedGuilds = (favorites.data?.guilds ?? []).filter((guild) => !selectedIds.includes(guild.id));
  const results = (search.data?.guilds ?? []).filter((guild) => !selectedIds.includes(guild.id));

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setQuery(""); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add guild</DialogTitle>
          <DialogDescription>Compare up to five guilds on the same raid and date range.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guild name…" className="pl-9" />
          </div>
          {debounced.length < 2 ? (
            <>
              <p className="-mt-1 text-[11px] text-muted-foreground/70">Type at least 2 characters to search.</p>
              {savedGuilds.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                    Your saved guilds
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-md border border-border styled-scrollbar">
                    {savedGuilds.map((guild) => <GuildPickRow key={guild.id} guild={guild} onSelect={() => onSelect(guild.id)} />)}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border border-border styled-scrollbar">
              {search.isLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Searching…</div>
              ) : results.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No guilds found.</div>
              ) : (
                results.slice(0, 15).map((guild) => <GuildPickRow key={guild.id} guild={guild} onSelect={() => onSelect(guild.id)} />)
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GuildPickRow({ guild, onSelect }: { guild: GuildInfo | FavoriteGuild; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-accent/50"
    >
      <span className="flex min-w-0 items-center gap-2">
        {guild.logo_url ? (
          <img src={guild.logo_url} alt="" className="size-6 shrink-0 rounded object-cover" />
        ) : (
          <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate font-medium">{guild.name}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{guild.realm_name}</span>
    </button>
  );
}
