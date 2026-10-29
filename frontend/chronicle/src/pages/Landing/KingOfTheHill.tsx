import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSupportedInstances } from "@/api/queries";
import { useSiteConfig } from "@/api/siteConfigQuery";
import type { SpeedrunInstanceBoard, SpeedrunLeaderboardEntry } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getInstanceArtCrop } from "@/pages/Logs/utils/instanceImages";
import { trackFunnel } from "@/utils/funnel";
import type { ExploreTarget } from "./explore3D";
import {
  crownLeader,
  filterThrones,
  HOTTEST_COUNT,
  leaderboardHref,
  recentRunsHref,
  sortThrones,
  throneFreshness,
  throneTabCounts,
  thronesFromBoards,
  WALL_PREVIEW,
  type Throne,
  type ThroneTab,
} from "./kingOfTheHill";
import { formatRunDuration } from "./recentRuns";

const GOLD = "text-[#e0b45c]";
const STALE_MS = 5 * 60 * 1000;
const TABS: { id: ThroneTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "raid", label: "Raids" },
  { id: "dungeon", label: "Dungeons" },
  { id: "custom", label: "Custom" },
];
const PLACES = ["1st", "2nd", "3rd"];

/** Every board on this tenant with its record: the one list call behind the hottest thrones and the wall. */
function useThroneBoards() {
  return useQuery({
    queryKey: ["landing", "speedrun-boards"],
    staleTime: STALE_MS,
    queryFn: async () => {
      const response = await fetch("/api/v1/rankings/speedrun/instances");
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return (await response.json()) as SpeedrunInstanceBoard[];
    },
  });
}

/** The selected throne's full-timing board, for its podium; fetched only once a throne is selected. */
function useThronePodium(throne: Throne | undefined) {
  return useQuery({
    queryKey: ["landing", "speedrun-podium", throne?.instanceName, throne?.difficultyName],
    enabled: Boolean(throne?.record),
    staleTime: STALE_MS,
    queryFn: async () => {
      const params = new URLSearchParams({ instance_name: throne!.instanceName, timing: "full", difficulty_name: throne!.difficultyName });
      const response = await fetch(`/api/v1/rankings/speedrun?${params}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return (await response.json()) as SpeedrunLeaderboardEntry[];
    },
  });
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="#e0b45c">
      <path d="M3 18h18l1-11-5.5 4L12 4l-4.5 7L2 7z" />
      <rect x="3" y="19" width="18" height="2" />
    </svg>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ThroneArt({ name, className }: { name: string; className: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`overflow-hidden rounded-t-[calc(var(--radius)+3px)] border-b bg-muted ${className}`}>
      {!failed && (
        <img
          src={getInstanceArtCrop(name)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

function HottestCard({ throne, selected, now, onSelect }: { throne: Throne; selected: boolean; now: Date; onSelect: () => void }) {
  const time = throne.record ? formatRunDuration(throne.record.duration_ms) : null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`relative flex shrink-0 basis-[160px] flex-col rounded-[calc(var(--radius)+4px)] border text-left text-card-foreground shadow-sm hover:brightness-110 lg:basis-auto ${
        selected ? "border-primary bg-primary-darker" : "bg-card"
      }`}
    >
      {selected && (
        <CrownIcon className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 lg:-top-[13px] lg:h-[26px] lg:w-[26px] lg:drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
      )}
      <ThroneArt name={throne.instanceName} className="h-14 lg:h-[72px]" />
      <div className="flex min-w-0 flex-col gap-0.5 px-2.5 pb-2.5 pt-2 lg:gap-[3px] lg:px-3 lg:pb-3 lg:pt-2.5">
        <div className="truncate text-[13px] font-semibold lg:text-sm">{throne.title}</div>
        <div className="truncate text-xs">{throne.record ? throne.record.guild_name : "Unclaimed"}</div>
        <div className="flex flex-col gap-0.5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-2">
          <span className={`whitespace-nowrap font-mono text-xs ${throne.record ? GOLD : "text-muted-foreground"}`}>{time ?? "no ranked clear"}</span>
          <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">{throneFreshness(throne, now)}</span>
        </div>
      </div>
    </button>
  );
}

function WallTile({ throne, selected, now, onSelect }: { throne: Throne; selected: boolean; now: Date; onSelect: () => void }) {
  const time = throne.record ? formatRunDuration(throne.record.duration_ms) : null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-11 min-w-0 flex-col gap-0.5 rounded-(--radius) border px-3 py-2.5 text-left text-card-foreground hover:brightness-110 ${
        selected ? "border-primary bg-primary-darker" : "bg-card"
      }`}
    >
      <b className="truncate text-[13px] font-semibold">{throne.title}</b>
      <small className="truncate text-[11px] text-muted-foreground">
        {throne.record ? throne.record.guild_name : "Unclaimed"}
        {time && (
          <>
            {" · "}
            <span className={`font-mono ${GOLD}`}>{time}</span>
          </>
        )}
      </small>
      <small className="truncate font-mono text-[11px] text-muted-foreground">
        {throneFreshness(throne, now)}
        <span className="hidden lg:inline"> · {throne.kind}</span>
      </small>
    </button>
  );
}

function GuildMark({ entry }: { entry: SpeedrunLeaderboardEntry }) {
  const [failed, setFailed] = useState(false);
  if (entry.guild_logo_url && !failed) {
    return <img src={entry.guild_logo_url} alt="" onError={() => setFailed(true)} className="h-7 w-7 shrink-0 rounded-(--radius) object-cover" />;
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius) border bg-muted text-xs font-semibold">
      {entry.guild_name.charAt(0).toUpperCase()}
    </span>
  );
}

// Desktop steps stand 2nd / 1st / 3rd at stepped heights; on a phone they stack in place order.
const STEP_LAYOUT = ["lg:order-2 lg:min-h-[176px]", "lg:order-1 lg:min-h-[152px]", "lg:order-3 lg:min-h-[136px]"];

function PodiumStep({ entry, place }: { entry: SpeedrunLeaderboardEntry; place: number }) {
  return (
    <Link
      to={`/instances/${entry.slug || entry.instance_id}`}
      className={`flex min-h-14 min-w-0 flex-1 items-center gap-2.5 rounded-(--radius) border bg-background p-3 text-foreground no-underline hover:border-primary lg:flex-col lg:items-stretch lg:gap-2 ${STEP_LAYOUT[place]}`}
    >
      <span className="w-[26px] shrink-0 font-mono text-[11px] text-muted-foreground lg:hidden">{PLACES[place]}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:flex-none lg:flex-col lg:items-start lg:gap-2">
        <GuildMark entry={entry} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{entry.guild_name}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            <span className="hidden lg:inline">{entry.realm_name ? `${entry.realm_name} · ` : ""}</span>
            {entry.player_count} players
            <span className="lg:hidden"> · {shortDate(entry.completion_time)}</span>
          </span>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2 lg:mt-auto">
        <span className={`font-mono text-base font-semibold lg:text-xl ${GOLD}`}>{formatRunDuration(entry.duration_ms)}</span>
        <span className="hidden font-mono text-[10px] text-muted-foreground lg:inline">
          {PLACES[place]} · {shortDate(entry.completion_time)}
        </span>
      </div>
    </Link>
  );
}

function Podium({ throne, siteName }: { throne: Throne; siteName: string | undefined }) {
  const { data: entries } = useThronePodium(throne);
  const top = (entries ?? []).slice(0, 3);
  // The endpoint returns at most 50 rows.
  const count = entries ? (entries.length >= 50 ? "50+" : String(entries.length)) : null;

  return (
    <div className="flex flex-col gap-2.5 rounded-[calc(var(--radius)+4px)] border bg-card p-3.5 text-card-foreground shadow-sm lg:gap-3.5 lg:px-5 lg:pb-4 lg:pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[15px] font-semibold lg:text-base">
          {throne.title}
          <span className="hidden font-normal text-muted-foreground lg:inline"> · full clear</span>
        </div>
        {throne.record && count && (
          <span className="font-mono text-[10px] text-muted-foreground lg:text-[11px]">
            {count} ranked full {count === "1" ? "clear" : "clears"}{siteName ? ` on ${siteName}` : ""}
          </span>
        )}
      </div>
      {throne.record ? (
        <div className="flex min-h-[104px] flex-col gap-1.5 lg:min-h-[176px] lg:flex-row lg:items-end lg:gap-2.5">
          {top.map((entry, place) => (
            <PodiumStep key={entry.instance_id} entry={entry} place={place} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 py-4">
          <div className="text-[15px] font-semibold lg:text-base">The throne is empty.</div>
          <div className="text-[13px] text-muted-foreground lg:text-sm">
            No ranked full clear<span className="hidden lg:inline"> of {throne.title} on this community</span> yet. The first
            logged clear takes the crown.
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <Button asChild className="min-h-11 lg:min-h-9">
          <Link to={leaderboardHref(throne)} className="no-underline">
            Full {throne.title} leaderboard
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 lg:min-h-9">
          <Link to={recentRunsHref(throne)} className="no-underline">
            See all {throne.title} runs
          </Link>
        </Button>
        <span className="hidden text-xs text-muted-foreground lg:inline">Each podium step opens that run.</span>
      </div>
    </div>
  );
}

function TimeToBeat({ throne, onExplore }: { throne: Throne; onExplore?: (target: ExploreTarget) => void }) {
  const isMobile = useIsMobile();
  const record = throne.record;
  return (
    <div className="flex flex-col gap-2 rounded-[calc(var(--radius)+4px)] border border-primary bg-primary-darker p-4 text-primary-foreground shadow-sm lg:gap-3 lg:p-5">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] lg:text-[11px]">Time to beat</span>
      <span className={`font-mono text-4xl font-semibold leading-none lg:text-[44px] ${GOLD}`}>
        {throne.record ? formatRunDuration(throne.record.duration_ms) : "—"}
      </span>
      <p className="m-0 text-[13px] leading-normal">
        Log your next {throne.title} clear with Sidekick and it is on this board the same night.
        <span className="hidden lg:inline"> Beat the time and the crown moves.</span>
      </p>
      {record?.has_positions && onExplore && (
        <button
          type="button"
          onClick={() => onExplore({ placement: "koth", instanceId: record.instance_id, poster: getInstanceArtCrop(throne.instanceName) })}
          className="inline-flex min-h-11 items-center justify-center rounded-[calc(var(--radius)-2px)] border border-[#e0b45c] px-4 text-sm font-semibold text-[#e0b45c] hover:bg-[#e0b45c]/10 lg:min-h-9"
        >
          Watch the record in 3D
        </button>
      )}
      <a
        href={isMobile ? "#send-link" : "#get"}
        onClick={() => trackFunnel("cta_sidekick", { placement: "koth" })}
        className="mt-auto inline-flex min-h-11 items-center justify-center rounded-[calc(var(--radius)-2px)] bg-[#e0b45c] px-4 text-sm font-semibold text-[#0c1322] no-underline hover:brightness-110 lg:min-h-9"
      >
        Get your guild on the board
      </a>
    </div>
  );
}

/** King of the Hill: who holds each speedrun record on this tenant, a wall of every throne, and the selected throne's podium. */
export function KingOfTheHill({ onExplore }: { onExplore?: (target: ExploreTarget) => void }) {
  const { data: boards } = useThroneBoards();
  const { data: supported } = useSupportedInstances();
  const { data: siteConfig } = useSiteConfig();
  const siteName = (siteConfig?.tenant?.branding ?? siteConfig?.branding)?.display_name;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<ThroneTab>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const now = useMemo(() => new Date(), []);
  const isMobile = useIsMobile();

  const thrones = useMemo(() => sortThrones(thronesFromBoards(boards ?? [], supported)), [boards, supported]);
  if (thrones.length === 0) return null;

  const hottest = thrones.slice(0, HOTTEST_COUNT);
  const selected = thrones.find((throne) => throne.key === selectedKey) ?? hottest[0];
  const leader = crownLeader(thrones);
  const counts = throneTabCounts(thrones);
  const matching = filterThrones(thrones, tab, query);
  // Typing a search shows every match.
  const showAll = expanded || query.trim() !== "";
  const tiles = showAll ? matching : matching.slice(0, WALL_PREVIEW);
  const select = (throne: Throne) => setSelectedKey(throne.key);

  return (
    <section id="crown" className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-3 px-4 pb-9 pt-7 lg:gap-4 lg:px-8 lg:pt-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-(--tertiary) lg:text-[11px]">King of the hill</span>
          <h2 className="m-0 text-xl font-semibold tracking-[-0.025em] lg:text-2xl">
            Who holds the crown{siteName ? ` on ${siteName}` : ""}?
          </h2>
          <p className="m-0 text-[13px] text-muted-foreground lg:text-sm">
            <span className="lg:hidden">Fastest full clears from logs here.</span>
            <span className="hidden lg:inline">Fastest full clears, from logs on this community. Pick a dungeon.</span>
            {leader && (
              <span className={`font-mono lg:hidden ${GOLD}`}>
                {" "}
                {leader.guild} holds {leader.held} of {leader.claimed} crowns
              </span>
            )}
          </p>
        </div>
        {leader && (
          <div className={`hidden items-center gap-1.5 font-mono text-xs lg:flex ${GOLD}`}>
            <CrownIcon className="h-3.5 w-3.5" />
            {leader.guild} holds {leader.held} of {leader.claimed} crowns
          </div>
        )}
      </div>

      <div className="flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold lg:text-sm">Hottest thrones</span>
          <span className="text-[11px] text-muted-foreground lg:text-xs">
            <span className="lg:hidden">newest records first</span>
            <span className="hidden lg:inline">Newest records first. Unclaimed thrones at the end.</span>
          </span>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 pt-3.5 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-visible lg:px-0 lg:pb-0 lg:pt-4">
          {hottest.map((throne) => (
            <HottestCard key={throne.key} throne={throne} selected={throne.key === selected.key} now={now} onSelect={() => select(throne)} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1.5 lg:pt-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
            <span className="text-[13px] font-semibold lg:mr-2 lg:text-sm">
              All thrones{" "}
              <span className="font-mono text-[11px] font-normal text-muted-foreground">
                {thrones.length} {thrones.length === 1 ? "throne" : "thrones"}
              </span>
            </span>
            <div className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={tab === id}
                  onClick={() => {
                    setTab(id);
                    setExpanded(false);
                  }}
                  className={`min-h-9 shrink-0 rounded-(--radius) px-3 py-2 text-sm ${
                    tab === id ? "bg-primary-darker text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label} {counts[id]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden lg:inline">Find a dungeon</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isMobile ? "Find a dungeon" : "Strat, Scholo, MC…"}
              aria-label="Find a dungeon"
              className="h-11 w-full rounded-(--radius) border bg-background px-2.5 text-sm text-foreground lg:h-9 lg:w-[200px]"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
          {tiles.map((throne) => (
            <WallTile key={throne.key} throne={throne} selected={throne.key === selected.key} now={now} onSelect={() => select(throne)} />
          ))}
        </div>
        {matching.length === 0 && <div className="py-3 text-sm text-muted-foreground">No thrones match.</div>}
        {matching.length > WALL_PREVIEW && query.trim() === "" && (
          <Button
            type="button"
            variant={expanded ? "ghost" : "outline"}
            onClick={() => setExpanded(!expanded)}
            className="min-h-11 w-full lg:min-h-9 lg:w-auto lg:self-start"
          >
            {expanded ? "Show fewer" : `Show all ${matching.length}`}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr] lg:gap-4">
        <Podium throne={selected} siteName={siteName} />
        <TimeToBeat throne={selected} onExplore={onExplore} />
      </div>
    </section>
  );
}
