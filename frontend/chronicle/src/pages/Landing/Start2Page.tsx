import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLandingFeatured } from "@/api/landingFeatured";
import type { LandingFeaturedRun } from "@/api/typesGenerated";
import { useSiteConfig } from "@/api/siteConfigQuery";
import { seoProductName } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { trackFunnel } from "@/utils/funnel";
import { BossRail } from "./BossRail";
import type { ExploreTarget } from "./explore3D";
import { useHeroClips, visitClip } from "./heroClips";
import { HeroMeter } from "./HeroMeter";
import { clipMeter, type HeroMeterPane } from "./heroMeter";
import { HeroReplayLayer, type HeroEntry } from "./HeroReplayLayer";
import { heroWindow, type HeroReplay } from "./heroReplay";
import { HeroScrubber, LandingHero } from "./LandingHero";
import { IMAGES } from "./startPageStyle";
import { whenIdle } from "./whenIdle";

// The sections below how-it-works and their queries: requested only once the trigger in BelowFold fires.
const StartBelowFold = lazy(() => import("./StartBelowFold"));
// The Explore modal: requested only when it opens.
const Explore3DModal = lazy(() => import("./Explore3DModal"));

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";

/** Bars in the meter strip under the replay below 900 px. */
const PHONE_METER_ROWS = 3;

/** A boss picked on the rail holds the montage on that pull this long (or until the replay is scrolled away). */
const BOSS_PICK_HOLD_MS = 60_000;

// The 3D hero's run when the site setting names none.
const FALLBACK_FEATURED_INSTANCE: string | undefined = import.meta.env.VITE_LANDING_FEATURED_INSTANCE || undefined;

const STEPS = [
  {
    title: "Install Sidekick, click Pair",
    body: "A tray app. Pairing opens your browser and that is your account.",
  },
  {
    title: (
      <>
        Type <span className="rounded bg-background px-1.5 py-px font-mono text-[#40ff40]">/combatlog</span> in game
      </>
    ),
    body: "Once per session. The tray stone turns teal when it hears the first fight.",
  },
  {
    title: "Your run appears here",
    body: "Minutes after you leave the instance. Replay it, share it, argue about it.",
  },
];

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
    <section id="send-link" className="flex flex-col gap-3 border-b bg-card px-4 py-5 lg:hidden">
      <h2 className="m-0 text-[22px] font-bold leading-tight">
        Sidekick runs on the PC you play on. Send it there.
      </h2>
      <p className="m-0 text-[13px] leading-normal text-muted-foreground">
        A tray app for Mac and Windows. We will send one link, nothing else.
      </p>
      <form className="flex flex-col gap-2" onSubmit={onSubmit}>
        <label htmlFor="landing-send-link" className="text-xs text-muted-foreground">
          Email or Discord handle
        </label>
        <input
          id="landing-send-link"
          type="text"
          placeholder="you@example.com"
          className="h-[46px] rounded-md border border-input bg-background px-3 text-[15px] text-foreground placeholder:text-muted-foreground"
        />
        <Button type="submit" variant="button-bright" className="h-12 text-[15px] font-semibold">
          Send me the download link
        </Button>
      </form>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={copyLink} className="h-11 flex-1 text-[13px]">
          {copied ? "Link copied" : "Copy link"}
        </Button>
        <Button asChild variant="outline" className="h-11 flex-1 text-[13px]">
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="no-underline">
            Join the Discord
          </a>
        </Button>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="border-b bg-background lg:bg-card">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-3.5 px-4 py-5 lg:grid-cols-3 lg:gap-6 lg:px-8 lg:py-[26px]">
        {STEPS.map((step, i) => (
          <div key={i} className="flex items-start gap-3 lg:gap-3.5">
            <div
              className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-primary-foreground lg:h-[34px] lg:w-[34px] lg:text-base ${
                i === STEPS.length - 1 ? "bg-primary" : "bg-primary-darker"
              }`}
            >
              {i + 1}
            </div>
            <div className="flex flex-col gap-0.5 lg:gap-1">
              <div className="text-sm font-semibold lg:text-[15px]">{step.title}</div>
              <div className="text-xs leading-normal text-muted-foreground lg:text-[13px]">{step.body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Mounts StartBelowFold after the shell's first paint: when the browser is idle (or 1.5 s
 * passed) or this slot nears the viewport, whichever comes first. Holds a screen of
 * height until then, so the footer never shows (or shifts) in its place.
 */
function BelowFold({ onExplore }: { onExplore: (target: ExploreTarget) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (load || !element) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setLoad(true), { rootMargin: "0px 0px 400px 0px" });
    // Two frames: the shell has painted at least once before the chunk and its requests go out.
    let cancelIdle: (() => void) | null = null;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        observer.observe(element);
        cancelIdle = whenIdle(() => setLoad(true));
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelIdle?.();
      observer.disconnect();
    };
  }, [load]);

  const placeholder = <div ref={ref} className="min-h-screen" />;
  return load ? (
    <Suspense fallback={placeholder}>
      <StartBelowFold onExplore={onExplore} />
    </Suspense>
  ) : (
    placeholder
  );
}

/** /start2: a working copy of StartPage inside the site Layout (our NavBar and Footer), to be edited down. */
export function Start2Page() {
  const getSidekickHref = "/download";
  const { data: landing, isError: landingFailed } = useLandingFeatured();
  const { data: siteConfig } = useSiteConfig();
  const siteName = (siteConfig?.tenant?.branding ?? siteConfig?.branding)?.display_name;
  // The SEO headline Home uses ("WoW Forever Combat Logs"), with the landing's line under it, muted.
  const productName = seoProductName(siteConfig?.dataset_flavor) || "WoW Forever";
  // The live 3D replay's position and controls, for the hero's scrubber; null while the poster shows.
  const [replay, setReplay] = useState<HeroReplay | null>(null);
  // The run the live 3D plays, kept while it changes pulls.
  const [liveRun, setLiveRun] = useState<LandingFeaturedRun | null>(null);
  if (replay && replay.run !== liveRun) setLiveRun(replay.run);
  // The montage's runs (a payload from before montages has the one featured run). Without any (the endpoint failed or
  // has no pick) the run the live 3D plays stands in, so the scrubber, boss rail and Explore work all the same.
  const runs = useMemo(() => landing?.entries?.length ? landing.entries : landing?.featured ? [landing.featured] : liveRun ? [liveRun] : [],
    [landing, liveRun]);
  // A boss pull picked on the rail for the entry at `index`; `hold` pauses the montage on it.
  const [bossPick, setBossPick] = useState<{ index: number; encounterId: string; hold: boolean } | null>(null);
  // Each entry a run's boss pull: its last one, or the one picked on the rail.
  const heroes = useMemo(
    () => runs.map((run, index) => heroWindow(run, bossPick?.index === index ? bossPick.encounterId : null)),
    [bossPick, runs],
  );
  // The 3D hero plays them in turn (the build-time instance's whole run when there are none).
  const heroEntries = useMemo((): HeroEntry[] => heroes.length > 0
    ? heroes.map((hero) => ({ instanceId: hero.run.instance_id, pull: hero.window }))
    : FALLBACK_FEATURED_INSTANCE ? [{ instanceId: FALLBACK_FEATURED_INSTANCE }] : [],
  [heroes]);
  const [heroIndex, setHeroIndex] = useState(0);
  // The hero's overlay the live replay portals the 3D map's meter window into.
  const [meterSlot, setMeterSlot] = useState<HTMLDivElement | null>(null);
  const holding = bossPick?.hold ?? false;
  const advanceHero = useCallback(() => {
    if (holding) return;
    setHeroIndex((index) => index + 1);
    setBossPick(null);
  }, [holding]);
  // The scrubber and caption follow the entry playing, spanning its pull only.
  const current = heroes.length > 0 ? heroIndex % heroes.length : -1;
  const hero = current >= 0 ? heroes[current] : null;
  // Set once the visitor touches the scrubber, a boss chip or the meter before the live 3D shows.
  const [liveRequested, setLiveRequested] = useState(false);
  const requestLive = useCallback(() => setLiveRequested(true), []);
  const pickBoss = useCallback((encounterId: string) => {
    setBossPick({ index: current, encounterId, hold: true });
    requestLive();
  }, [current, requestLive]);
  const releaseHold = useCallback(() => setBossPick((pick) => pick && { ...pick, hold: false }), []);
  // The hero and its boss rail: scrolling it away releases a held pick.
  const replaySectionRef = useRef<HTMLDivElement>(null);
  // The pre-rendered clips play until the live 3D shows: index.html picked this visit's (and painted its poster),
  // and each pass moves on to the next.
  const { data: clips } = useHeroClips();
  const [visit] = useState(visitClip);
  const [clipPasses, setClipPasses] = useState(0);
  const nextClip = useCallback(() => setClipPasses((passes) => passes + 1), []);
  const firstClip = clips ? Math.max(0, clips.findIndex((clip) => clip.slug === visit?.slug)) : 0;
  const clip = clips?.length ? clips[(firstClip + clipPasses) % clips.length] : null;
  // The glass meter: the clip's numbers, then the live run's once processed.
  const [pane, setPane] = useState<HeroMeterPane>("damage_done");
  const meter = replay?.meter ?? (clip ? clipMeter(clip) : null);
  const meterKey = replay?.meter ? `live-${hero?.run.instance_id}` : `clip-${clip?.slug}`;
  // The run page link: the live replay's run, else the run it will play.
  const meterRun = meter?.run ?? (hero ? { id: hero.run.instance_id } : null);
  const changePane = (next: HeroMeterPane) => {
    setPane(next);
    // A clip has no healing numbers: the live replay brings them.
    if (next === "healing_done" && !meter?.healing) requestLive();
  };

  useEffect(() => {
    if (!holding) return;
    const timer = window.setTimeout(releaseHold, BOSS_PICK_HOLD_MS);
    const element = replaySectionRef.current;
    const observer = new IntersectionObserver(([entry]) => !entry.isIntersecting && releaseHold());
    if (element) observer.observe(element);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [bossPick, holding, releaseHold]);

  // The funnel's denominator: one per visit to /start, with its campaign.
  useEffect(() => trackFunnel("land"), []);

  // The Explore modal and whether it took over the hero's live scene (decided on open, so it never moves).
  const [explore, setExplore] = useState<(ExploreTarget & { hosted: boolean }) | null>(null);
  const openExplore = useCallback((target: ExploreTarget, hosted = false) => {
    trackFunnel("explore_3d_open", { placement: target.placement });
    setExplore({ ...target, hosted });
  }, []);
  const closeExplore = useCallback(() => setExplore(null), []);
  // From the hero: the playing pull, from where it is; the live backdrop hands over its loaded run when it plays.
  const exploreHero = (placement: "hero" | "hero_chip") => {
    const run = current >= 0 ? runs[current] : null;
    if (!run) return;
    openExplore({
      placement,
      instanceId: run.instance_id,
      run,
      encounterId: hero?.window?.encounterId ?? null,
      startMs: replay?.currentMs,
      poster: clip?.poster ?? visit?.poster ?? null,
    }, replay !== null);
  };
  const exploreModal = explore && (
    // Its own boundary: the modal's chunk loading never suspends the hero around it.
    <Suspense fallback={<div className="fixed inset-0 z-[100] bg-background/80" />}>
      <Explore3DModal target={explore} onClose={closeExplore} Scrubber={HeroScrubber} Rail={BossRail} Meter={HeroMeter} />
    </Suspense>
  );

  // Our hero now covers the static poster index.html painted before the bundle loaded.
  useLayoutEffect(() => {
    document.getElementById("start-poster-shell")?.remove();
  }, []);

  return (
    <div className="flex flex-col overflow-x-hidden bg-background text-foreground">
      <div ref={replaySectionRef}>
        <LandingHero
          poster={visit?.poster ?? clip?.poster ?? `${IMAGES}/ruins-courtyard-poster.jpg`}
          posterPortrait={visit?.posterPortrait ?? clip?.portrait.poster ?? `${IMAGES}/ruins-courtyard-poster-portrait.jpg`}
          posterAlt="3D replay of a dungeon boss fight"
          clip={clip}
          clipLoops={clips?.length === 1}
          onClipEnded={nextClip}
          live={replay !== null}
          onRequestLive={requestLive}
          siteName={siteName}
          headline={
            <div className="flex flex-col gap-2 lg:gap-3">
              {/* Phones: one line each, and only the headline and the button (the lines below hide). */}
              <h1 className="m-0 max-w-[700px] text-[24px] font-bold leading-[1.15] tracking-tight text-foreground sm:text-[32px] sm:leading-[1.08] lg:text-[44px] lg:leading-[1.06]">
                {productName} Combat Logs
                <br />
                <span className="text-(--tertiary)">Raid analysis by Chronicle.</span>
              </h1>
              <p className="m-0 hidden text-lg font-semibold text-muted-foreground sm:block lg:text-xl">Every dungeon you run, saved in detail.</p>
            </div>
          }
          blurb={
            <p className="m-0 hidden max-w-[540px] text-[15px] leading-normal text-foreground/85 sm:block lg:text-lg">
              Sidekick sits in your tray and uploads each fight{siteName ? ` to ${siteName}` : ""} in the background while you play.
            </p>
          }
          footer={
            // The boss rail over the replay's bottom edge, under the scrubber.
            <BossRail
              bosses={landing || landingFailed ? runs[current]?.bosses ?? [] : undefined}
              selectedId={hero?.window?.encounterId ?? null}
              onPick={pickBoss}
              label={false}
              ticker
              overlay
            />
          }
          meter={
            // From 900 px up the live replay draws the 3D map's own meter window (Damage Done) here.
            <div ref={setMeterSlot} className="pointer-events-none absolute inset-0 mx-auto hidden max-w-[1180px] min-[900px]:block" />
          }
          featured={hero?.run}
          currentMs={replay?.currentMs}
          playback={replay}
          getSidekickHref={getSidekickHref}
          ctaVariant="default"
          layer3D={landing || landingFailed ? (
            <HeroReplayLayer
              entries={heroEntries}
              index={heroIndex}
              requested={liveRequested}
              paused={explore !== null}
              explore={explore?.hosted ? exploreModal : null}
              onAdvance={advanceHero}
              onReplay={setReplay}
              meterSlot={meterSlot}
            />
          ) : null}
          onExplore={hero ? exploreHero : undefined}
        />
        {meter && (
          // Below 900 px the meter is a strip under the replay, its top three bars.
          <div className="border-b bg-card px-4 py-4 min-[900px]:hidden">
            <HeroMeter data={meter} sourceKey={meterKey} pane={pane} onPaneChange={changePane} rows={PHONE_METER_ROWS} onDrill={requestLive} placement="strip" run={meterRun} />
          </div>
        )}
      </div>
      <SendLinkSection />
      <HowItWorks />
      <BelowFold onExplore={openExplore} />
      {explore && !explore.hosted && exploreModal}
    </div>
  );
}
