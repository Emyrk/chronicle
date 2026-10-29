import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { RecentInstance, RecentInstancesResponse } from "@/api/typesGenerated";
import { getInstanceArtCrop } from "@/pages/Logs/utils/instanceImages";
import { trackFunnel } from "@/utils/funnel";
import { KingOfTheHill } from "./KingOfTheHill";
import { formatRunDuration, runBadge, runStillUrl, type RunBadge } from "./recentRuns";
import { IMAGES } from "./startPageStyle";

// Public Sidekick downloads; the utm cookie set on landing carries attribution.
const DOWNLOAD_MAC_URL = "/download?os=macos";
const DOWNLOAD_WINDOWS_URL = "/download?os=windows";

const FIRST_MINUTE = [
  {
    src: `${IMAGES}/still-walk-the-run.jpg`,
    alt: "Replay still: the group entering the Ruins courtyard",
    title: "Walk the whole run",
    body: "Camera follows the party from the first pull to the last boss. Jump between bosses with one click.",
  },
  {
    src: `${IMAGES}/still-casts-land.jpg`,
    alt: "Replay still: fight by the courtyard fence with cast icons over the players",
    title: "See the casts land",
    body: "Spell icons float over the players as they cast. Heals, DoT ticks and overheal, toggled on when you want them.",
  },
  {
    src: `${IMAGES}/still-who-died.jpg`,
    alt: "Replay still: the party on the platform at Viktor the Vile",
    title: "Find out who died to what",
    body: "Every death is a marker on the bar. Hover it, the killing blow and the last ten seconds of damage are right there.",
  },
];

function FirstMinute() {
  return (
    <section className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-[18px] px-4 pb-3 pt-8 lg:px-8 lg:pt-10">
      <h2 className="m-0 text-[22px] font-bold lg:text-[28px]">Three things people do in the first minute</h2>
      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
        {FIRST_MINUTE.map((card) => (
          <div key={card.title} className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
            <img src={card.src} alt={card.alt} loading="lazy" className="block h-40 w-full object-cover" />
            <div className="flex flex-col gap-1.5 px-4 py-3.5">
              <div className="text-[15px] font-semibold">{card.title}</div>
              <div className="text-[13px] leading-normal text-muted-foreground">{card.body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Replays first (their cards show a still), then video runs, then the rest, so the rail always fills.
const RECENT_RUNS_URL = "/api/v1/raidlogs/recent?days=60&limit=3&prefer=replay";

function useRecentRuns() {
  return useQuery({
    queryKey: ["landing", "recent-runs"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const response = await fetch(RECENT_RUNS_URL);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return (await response.json()) as RecentInstancesResponse;
    },
  });
}

function RunCard({ run, badge }: { run: RecentInstance; badge: RunBadge | null }) {
  // Only replays have a still; don't request one for a backfilled regular run.
  const [still, setStill] = useState<"loading" | "loaded" | "missing">(run.has_positions ? "loading" : "missing");
  const [artFailed, setArtFailed] = useState(false);
  const duration = formatRunDuration(run.duration_ms);
  const href = `/instances/${run.slug || run.id}`;

  return (
    <Link
      to={href}
      className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm no-underline hover:border-primary"
    >
      <div className="relative h-[130px] overflow-hidden bg-muted">
        {/* Until this run's still loads (or when it has none yet): a muted crop of the dungeon's art. */}
        {still !== "loaded" && !artFailed && (
          <img
            src={getInstanceArtCrop(run.name)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setArtFailed(true)}
            className="absolute inset-0 h-full w-full object-cover opacity-40 grayscale-[60%]"
          />
        )}
        {still !== "missing" && (
          <img
            src={runStillUrl(run.id)}
            alt={`Replay still of ${run.name}`}
            loading="lazy"
            decoding="async"
            width={640}
            height={360}
            onLoad={() => setStill("loaded")}
            onError={() => setStill("missing")}
            className={`absolute inset-0 h-full w-full object-cover ${still === "loaded" ? "" : "invisible"}`}
          />
        )}
        {badge === "replay" && (
          <span className="absolute left-2.5 top-2.5 rounded-md bg-background/85 px-2 py-[3px] text-[11px] font-semibold tracking-[0.08em] text-primary">
            3D REPLAY
          </span>
        )}
        {duration && (
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-background/85 px-2 py-[3px] font-mono text-[11px] text-foreground">
            {duration}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 px-3.5 py-3">
        <div className="text-[15px] font-semibold">{run.name}</div>
        <div className="text-xs text-muted-foreground">
          {run.player_count} players · {run.boss_kills} {run.boss_kills === 1 ? "boss" : "bosses"}
        </div>
      </div>
    </Link>
  );
}

function RecentRuns() {
  const { data } = useRecentRuns();
  const runs = (data?.instances ?? [])
    // The endpoint lists every upload of a duplicate run, its representative first; one card per run.
    .filter((run, i, all) => !run.duplicate_group_id || all.findIndex((other) => other.duplicate_group_id === run.duplicate_group_id) === i)
    .slice(0, 3);

  return (
    <section id="runs" className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-3.5 px-4 pb-3 pt-7 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="m-0 text-xl font-bold lg:text-2xl">Recent runs</h2>
        <Link to="/recent" className="text-sm text-link hover:underline">
          All recent runs
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {runs.map((run) => (
          <RunCard key={run.id} run={run} badge={runBadge(run)} />
        ))}
        <Link
          to="/download"
          onClick={() => trackFunnel("cta_sidekick", { placement: "ghost_card" })}
          className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm border-dashed no-underline hover:border-primary"
        >
          <div className="flex h-[130px] flex-col items-center justify-center gap-1.5 bg-muted p-4 text-center">
            <div className="text-lg font-bold">Your run goes here</div>
            <div className="text-xs text-muted-foreground">Tonight, if Sidekick is running.</div>
          </div>
          <div className="flex flex-col gap-1 px-3.5 py-3">
            <div className="text-[15px] font-semibold text-primary">Get Sidekick</div>
            <div className="text-xs text-muted-foreground">2 minutes to set up</div>
          </div>
        </Link>
      </div>
    </section>
  );
}

function ClosingBand() {
  return (
    <section id="get" className="hidden border-t bg-card lg:block">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 p-8">
        <div className="flex max-w-[560px] flex-col gap-1.5">
          <h2 className="m-0 text-[26px] font-bold">Tonight's run could be on this page.</h2>
          <p className="m-0 text-sm leading-normal text-muted-foreground">
            Sidekick is a 9 MB tray app. It never opens a window, never asks you to upload anything, and the stone
            tells you it is working.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {[
            [DOWNLOAD_MAC_URL, "Download for macOS"],
            [DOWNLOAD_WINDOWS_URL, "Download for Windows"],
          ].map(([href, label]) => (
            <Button key={href} asChild variant="button-bright" size="lg" className="h-12 text-[15px] font-semibold">
              <a href={href} onClick={() => trackFunnel("cta_sidekick", { placement: "band" })} className="no-underline">
                {label}
              </a>
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Everything on /start below how-it-works: its own chunk, so none of it (or its requests) goes out before first paint. */
export default function StartBelowFold() {
  return (
    <>
      <FirstMinute />
      <RecentRuns />
      <KingOfTheHill />
      <ClosingBand />
    </>
  );
}
