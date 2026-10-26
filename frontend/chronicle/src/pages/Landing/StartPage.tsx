import { useLayoutEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useLandingFeatured, useSupportedInstances } from "@/api/queries";
import type { RecentInstance, RecentInstancesResponse } from "@/api/typesGenerated";
import { useTenantDatasetScope } from "@/hooks/useDatasetId";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getInstanceArtCrop } from "@/pages/Logs/utils/instanceImages";
import { fetchMapManifest } from "@/pages/Technical/mapManifest";
import { dungeonMapKind, dungeonNames, dungeonShelfCards } from "./dungeonShelf";
import { HeroReplayLayer } from "./HeroReplayLayer";
import type { HeroReplay } from "./heroReplay";
import { LandingHero } from "./LandingHero";
import { formatRunDuration, runBadge, runStillUrl, type RunBadge } from "./recentRuns";

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";
// Public Sidekick downloads; the utm cookie set on landing carries attribution.
const DOWNLOAD_MAC_URL = "/download?os=macos";
const DOWNLOAD_WINDOWS_URL = "/download?os=windows";

const IMAGES = "/c/images/landing";
// The 3D hero's run when the site setting names none.
const FALLBACK_FEATURED_INSTANCE: string | undefined = import.meta.env.VITE_LANDING_FEATURED_INSTANCE || undefined;
const HEADING_FONT = "font-['Libre_Baskerville',Georgia,serif]";

const STEPS = [
  {
    title: "Install Sidekick, click Pair",
    body: "A tray app. Pairing opens your browser and that is your account.",
  },
  {
    title: (
      <>
        Type <span className="rounded bg-[#0c1322] px-1.5 py-px font-mono text-[#40ff40]">/combatlog</span> in game
      </>
    ),
    body: "Once per session. The tray stone turns teal when it hears the first fight.",
  },
  {
    title: "Your run appears here",
    body: "Minutes after you leave the instance. Replay it, share it, argue about it.",
  },
];

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

const FOOTER_LINKS = [
  { to: "/armory", label: "Armory" },
  { to: "/leaderboards/statistics", label: "Leaderboards" },
  { to: "/census", label: "Census" },
  { to: "/talents", label: "Talents" },
  { to: "/upload", label: "Upload manually" },
  { to: "/developers/api", label: "API" },
];

function LandingNav({ getSidekickHref }: { getSidekickHref: string }) {
  // Fixed height: the pre-JS poster shell in index.html sits exactly below it.
  return (
    <nav className="flex h-14 items-center justify-between gap-4 border-b border-[#27324a] px-4 lg:h-16 lg:px-8">
      <a href="#top" className="flex items-center gap-2 text-[#e8eef8] no-underline lg:gap-2.5">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#e0b45c] text-[13px] font-bold text-[#e0b45c] lg:h-7 lg:w-7 lg:text-base ${HEADING_FONT}`}
        >
          C
        </span>
        <span className={`text-lg font-bold lg:text-xl ${HEADING_FONT}`}>Chronicle</span>
        <span className="ml-1 hidden text-xs uppercase tracking-[0.12em] text-[#8a97ad] lg:inline">WoW Forever</span>
      </a>
      <div className="hidden gap-1.5 lg:flex">
        {[
          ["#runs", "Watch runs"],
          ["#dungeons", "Dungeons"],
          ["#how", "How it works"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-[#e8eef8] no-underline hover:bg-white/5"
          >
            {label}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <a
          href={getSidekickHref}
          className="rounded-lg bg-[#e0b45c] px-3 py-2 text-[13px] font-semibold text-[#0c1322] no-underline hover:bg-[#e8c477] lg:px-4 lg:py-2.5 lg:text-sm"
        >
          Get Sidekick
        </a>
        <Link
          to="/login"
          className="rounded-lg px-2 py-2 text-[13px] font-medium text-[#b7c2d6] no-underline hover:text-[#e8eef8] lg:px-3 lg:py-2.5 lg:text-sm"
        >
          Sign in
        </Link>
      </div>
    </nav>
  );
}

/** Phone install CTA: Sidekick runs on the gaming PC, so offer to send the link there. */
function SendLinkSection() {
  const [copied, setCopied] = useState(false);

  // Not wired to a backend yet; a later car decides where the address goes.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  const copyLink = () => {
    void navigator.clipboard?.writeText(`${window.location.origin}/start`).then(() => setCopied(true));
  };

  return (
    <section id="send-link" className="flex flex-col gap-3 border-b border-[#27324a] bg-[#101829] px-4 py-5 lg:hidden">
      <h2 className={`m-0 text-[22px] font-bold leading-tight ${HEADING_FONT}`}>
        Sidekick runs on the PC you play on. Send it there.
      </h2>
      <p className="m-0 text-[13px] leading-normal text-[#b7c2d6]">
        9 MB tray app for Mac and Windows. We will send one link, nothing else.
      </p>
      <form className="flex flex-col gap-2" onSubmit={onSubmit}>
        <label htmlFor="landing-send-link" className="text-xs text-[#b7c2d6]">
          Email or Discord handle
        </label>
        <input
          id="landing-send-link"
          type="text"
          placeholder="you@example.com"
          className="h-[46px] rounded-lg border border-[#5f6d88] bg-[#0c1322] px-3 text-[15px] text-[#e8eef8] placeholder:text-[#8a97ad]"
        />
        <button type="submit" className="h-12 rounded-[10px] bg-[#e0b45c] text-[15px] font-semibold text-[#0c1322]">
          Send me the download link
        </button>
      </form>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="flex-1 rounded-lg border border-[#5f6d88] p-3 text-[13px] font-medium text-[#e8eef8]"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-lg border border-[#5f6d88] p-3 text-center text-[13px] font-medium text-[#e8eef8] no-underline"
        >
          Join the Discord
        </a>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="border-b border-[#27324a] bg-[#0c1322] lg:bg-[#101829]">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-3.5 px-4 py-5 lg:grid-cols-3 lg:gap-6 lg:px-8 lg:py-[26px]">
        {STEPS.map((step, i) => (
          <div key={i} className="flex items-start gap-3 lg:gap-3.5">
            <div
              className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-[#0c1322] lg:h-[34px] lg:w-[34px] lg:text-base ${
                i === STEPS.length - 1 ? "bg-[#4fd1c5]" : "bg-[#e0b45c]"
              }`}
            >
              {i + 1}
            </div>
            <div className="flex flex-col gap-0.5 lg:gap-1">
              <div className="text-sm font-semibold lg:text-[15px]">{step.title}</div>
              <div className="text-xs leading-normal text-[#b7c2d6] lg:text-[13px]">{step.body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FirstMinute() {
  return (
    <section className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-[18px] px-4 pb-3 pt-8 lg:px-8 lg:pt-10">
      <h2 className={`m-0 text-[22px] font-bold lg:text-[28px] ${HEADING_FONT}`}>Three things people do in the first minute</h2>
      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
        {FIRST_MINUTE.map((card) => (
          <div key={card.title} className="flex flex-col overflow-hidden rounded-xl border border-[#27324a] bg-[#141d30]">
            <img src={card.src} alt={card.alt} loading="lazy" className="block h-40 w-full object-cover" />
            <div className="flex flex-col gap-1.5 px-4 py-3.5">
              <div className="text-[15px] font-semibold">{card.title}</div>
              <div className="text-[13px] leading-normal text-[#b7c2d6]">{card.body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The maps manifest: the same query as the Map panel's, so they share one cached fetch. */
function useMapManifest() {
  const { iconBaseUrl } = useTenantDatasetScope();
  return useQuery({
    queryKey: ["wow-map-manifest", iconBaseUrl],
    enabled: Boolean(iconBaseUrl),
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchMapManifest(iconBaseUrl!),
  });
}

// Only runs with a replay: their cards show a still, never a wall of placeholders.
const RECENT_RUNS_URL = "/api/v1/raidlogs/recent?days=60&limit=3&has_positions=true";

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
  const [still, setStill] = useState<"loading" | "loaded" | "missing">("loading");
  const [artFailed, setArtFailed] = useState(false);
  const duration = formatRunDuration(run.duration_ms);
  const href = `/instances/${run.slug || run.id}`;

  return (
    <Link
      to={href}
      className="flex flex-col overflow-hidden rounded-xl border border-[#27324a] bg-[#141d30] text-[#e8eef8] no-underline hover:border-[#5f6d88]"
    >
      <div className="relative h-[130px] overflow-hidden bg-[#1b2740]">
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
        {badge && (
          <span
            className={`absolute left-2.5 top-2.5 rounded-md bg-[#0c1322]/85 px-2 py-[3px] text-[11px] font-semibold tracking-[0.08em] ${
              badge === "3d" ? "text-[#4fd1c5]" : "text-[#b7c2d6]"
            }`}
          >
            {badge === "3d" ? "3D REPLAY" : "2D MAP"}
          </span>
        )}
        {duration && (
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-[#0c1322]/85 px-2 py-[3px] font-mono text-[11px] text-[#e8eef8]">
            {duration}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 px-3.5 py-3">
        <div className="text-[15px] font-semibold">{run.name}</div>
        <div className="text-xs text-[#b7c2d6]">
          {run.player_count} players · {run.boss_kills} {run.boss_kills === 1 ? "boss" : "bosses"}
        </div>
      </div>
    </Link>
  );
}

function RecentRuns() {
  const { data } = useRecentRuns();
  const { data: instances } = useSupportedInstances();
  const { data: manifest } = useMapManifest();
  const runs = (data?.instances ?? [])
    // The endpoint lists every upload of a duplicate run, its representative first; one card per run.
    .filter((run, i, all) => !run.duplicate_group_id || all.findIndex((other) => other.duplicate_group_id === run.duplicate_group_id) === i)
    .slice(0, 3);

  return (
    <section id="runs" className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-3.5 px-4 pb-3 pt-7 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className={`m-0 text-xl font-bold lg:text-2xl ${HEADING_FONT}`}>Recent runs</h2>
        <Link to="/recent" className="text-sm text-[#4fd1c5] hover:text-[#8ee6dd]">
          All recent runs
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {runs.map((run) => (
          <RunCard key={run.id} run={run} badge={runBadge(run, dungeonMapKind(dungeonNames(run.name, instances ?? []), manifest))} />
        ))}
        <Link
          to="/download"
          className="flex flex-col overflow-hidden rounded-xl border border-dashed border-[#5f6d88] bg-[#141d30] text-[#e8eef8] no-underline hover:border-[#e0b45c]"
        >
          <div className="flex h-[130px] flex-col items-center justify-center gap-1.5 bg-[#101829] p-4 text-center">
            <div className={`text-lg font-bold ${HEADING_FONT}`}>Your run goes here</div>
            <div className="text-xs text-[#b7c2d6]">Tonight, if Sidekick is running.</div>
          </div>
          <div className="flex flex-col gap-1 px-3.5 py-3">
            <div className="text-[15px] font-semibold text-[#e0b45c]">Get Sidekick</div>
            <div className="text-xs text-[#b7c2d6]">2 minutes to set up</div>
          </div>
        </Link>
      </div>
    </section>
  );
}

function DungeonShelf() {
  const { data: instances } = useSupportedInstances();
  const { data: manifest } = useMapManifest();
  const cards = dungeonShelfCards(instances ?? [], manifest);

  return (
    <section id="dungeons" className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-3.5 px-4 pb-9 pt-7 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className={`m-0 text-xl font-bold lg:text-2xl ${HEADING_FONT}`}>Real floors, not dots on a map</h2>
        <Link to="/supported" className="text-sm text-[#4fd1c5] hover:text-[#8ee6dd]">
          All supported instances
        </Link>
      </div>
      <ul className="styled-scrollbar m-0 flex list-none gap-3 overflow-x-auto p-0 pb-1.5">
        {cards.map((d) => (
          <li key={d.name} className="flex shrink-0 basis-[190px]">
            <Link
              to={`/recent?inst=${encodeURIComponent(d.name)}`}
              className={`flex w-full flex-col gap-1 rounded-[10px] border bg-[#141d30] p-3.5 text-[#e8eef8] no-underline hover:bg-[#1a2540] ${
                d.kind === "3d" ? "border-[#4fd1c5]" : "border-[#27324a]"
              }`}
            >
              <div className="font-semibold">{d.name}</div>
              <div
                className={`text-xs ${
                  d.kind === "3d" ? "text-[#8ee6dd]" : d.kind === "2d" ? "text-[#b7c2d6]" : "text-[#8a97ad]"
                }`}
              >
                {d.kind === "3d" ? "3D floor" : d.kind === "2d" ? "2D map" : "Coming"}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClosingBand() {
  return (
    <section id="get" className="hidden border-t border-[#27324a] bg-[#101829] lg:block">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 p-8">
        <div className="flex max-w-[560px] flex-col gap-1.5">
          <h2 className={`m-0 text-[26px] font-bold ${HEADING_FONT}`}>Tonight's run could be on this page.</h2>
          <p className="m-0 text-sm leading-normal text-[#b7c2d6]">
            Sidekick is a 9 MB tray app. It never opens a window, never asks you to upload anything, and the stone
            tells you it is working.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {[
            [DOWNLOAD_MAC_URL, "Download for macOS"],
            [DOWNLOAD_WINDOWS_URL, "Download for Windows"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-[10px] bg-[#e0b45c] px-5 py-[13px] text-[15px] font-semibold text-[#0c1322] no-underline hover:bg-[#e8c477]"
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Public ad landing: Landing 1, "a run is already playing". */
export function StartPage() {
  const isMobile = useIsMobile();
  const getSidekickHref = isMobile ? "#send-link" : "#get";
  const { data: landing, isError: landingFailed } = useLandingFeatured();
  // The 3D hero replays the featured run (the build-time instance when none is set); undefined until that is known.
  const heroInstanceId = landing || landingFailed ? landing?.featured?.instance_id ?? FALLBACK_FEATURED_INSTANCE : undefined;
  // The live 3D replay's position and controls, for the hero's scrubber; null while the poster shows.
  const [replay, setReplay] = useState<HeroReplay | null>(null);

  // Our hero now covers the static poster index.html painted before the bundle loaded.
  useLayoutEffect(() => {
    document.getElementById("start-poster-shell")?.remove();
  }, []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#0c1322] text-[#e8eef8]">
      <LandingNav getSidekickHref={getSidekickHref} />
      <LandingHero
        poster={`${IMAGES}/ruins-courtyard-poster.jpg`}
        posterPortrait={`${IMAGES}/ruins-courtyard-poster-portrait.jpg`}
        posterAlt="3D replay: a five-player group fighting on the stone platform in the Ruins of Lordaeron courtyard"
        featured={landing?.featured}
        currentMs={replay?.currentMs}
        playback={replay}
        getSidekickHref={getSidekickHref}
        layer3D={heroInstanceId ? <HeroReplayLayer instanceId={heroInstanceId} onReplay={setReplay} /> : null}
      />
      <SendLinkSection />
      <HowItWorks />
      <FirstMinute />
      <RecentRuns />
      <DungeonShelf />
      <ClosingBand />
      <footer className="mt-auto flex flex-wrap gap-3 border-t border-[#27324a] px-4 py-3.5 text-[11px] text-[#8a97ad] lg:gap-[18px] lg:px-8 lg:py-[18px] lg:text-xs">
        <span>Chronicle for WoW Forever</span>
        {FOOTER_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="text-[#4fd1c5] hover:text-[#8ee6dd]">
            {link.label}
          </Link>
        ))}
      </footer>
    </div>
  );
}
