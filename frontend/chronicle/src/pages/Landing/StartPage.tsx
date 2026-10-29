import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useLandingFeatured } from "@/api/landingFeatured";
import { useSiteConfig } from "@/api/siteConfigQuery";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useIsMobile";
import { trackFunnel } from "@/utils/funnel";
import { BossRail } from "./BossRail";
import { HeroReplayLayer, type HeroEntry } from "./HeroReplayLayer";
import { heroWindow, type HeroReplay } from "./heroReplay";
import { LandingHero } from "./LandingHero";
import { IMAGES } from "./startPageStyle";
import { whenIdle } from "./whenIdle";

// The sections below how-it-works and their queries: requested only once the trigger in BelowFold fires.
const StartBelowFold = lazy(() => import("./StartBelowFold"));

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";

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

const FOOTER_LINKS = [
  { to: "/armory", label: "Armory" },
  { to: "/leaderboards/statistics", label: "Leaderboards" },
  { to: "/census", label: "Census" },
  { to: "/talents", label: "Talents" },
  { to: "/upload", label: "Upload manually" },
  { to: "/developers/api", label: "API" },
];

const NAV_LINK = "text-sm text-muted-foreground no-underline transition-colors hover:text-foreground";

/**
 * A light copy of the Layout NavBar (same height, tenant logo and button styles), so /start does not pay
 * for NavBar's account menus before first paint.
 */
function LandingNav({ getSidekickHref }: { getSidekickHref: string }) {
  const { data: siteConfig } = useSiteConfig();
  // Tenant overrides site-level, as in NavBar.
  const branding = siteConfig?.tenant?.branding ?? siteConfig?.branding ?? null;
  const hasBranding = !!(branding?.logo_wide || branding?.square_logo || branding?.display_name);

  // Fixed height, NavBar's with a tenant logo: the pre-JS poster shell in index.html sits exactly below it.
  return (
    <nav className="relative flex h-[69px] items-center justify-between gap-4 border-b p-4 md:h-[73px]">
      <div className="flex w-10 items-center">
        {hasBranding && <img src="/c/chronicle/ChronicleIcon.webp" alt="Chronicle" className="hidden h-10 w-10 md:block" />}
        <Link to="/login" className={`${NAV_LINK} whitespace-nowrap md:hidden`}>
          Sign in
        </Link>
      </div>
      <a href="#top" className="absolute left-1/2 flex -translate-x-1/2 items-center">
        {/* Nothing until site config is known, so a tenant never flashes the Chronicle logo. */}
        {!siteConfig ? null : branding?.logo_wide ? (
          <img src={branding.logo_wide} alt={branding.display_name ?? ""} className="-my-2 h-15 max-w-[44vw] object-contain" />
        ) : hasBranding ? (
          <div className="flex items-center gap-2">
            {branding?.square_logo && <img src={branding.square_logo} alt="" className="h-8 w-8 rounded object-contain" />}
            {branding?.display_name && <span className="text-lg font-semibold text-foreground">{branding.display_name}</span>}
          </div>
        ) : (
          <img src="/c/chronicle/ChronicleLogoCenter.svg" alt="Chronicle" className="-my-2 h-15" />
        )}
      </a>
      <div className="flex items-center gap-6">
        <div className="hidden items-center gap-6 lg:flex">
          {[
            ["#runs", "Watch runs"],
            ["#dungeons", "Dungeons"],
            ["#how", "How it works"],
          ].map(([href, label]) => (
            <a key={href} href={href} className={NAV_LINK}>
              {label}
            </a>
          ))}
        </div>
        <Button asChild variant="button-bright" size="sm" className="md:h-9 md:px-4">
          <a
            href={getSidekickHref}
            onClick={() => trackFunnel("cta_sidekick", { placement: "nav" })}
            className="no-underline"
          >
            Get Sidekick
          </a>
        </Button>
        <Button asChild className="hidden md:inline-flex">
          <Link to="/login" className="no-underline">
            Sign in
          </Link>
        </Button>
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
    <section id="send-link" className="flex flex-col gap-3 border-b bg-card px-4 py-5 lg:hidden">
      <h2 className="m-0 text-[22px] font-bold leading-tight">
        Sidekick runs on the PC you play on. Send it there.
      </h2>
      <p className="m-0 text-[13px] leading-normal text-muted-foreground">
        9 MB tray app for Mac and Windows. We will send one link, nothing else.
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
function BelowFold() {
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
      <StartBelowFold />
    </Suspense>
  ) : (
    placeholder
  );
}

/** Public ad landing: Landing 1, "a run is already playing". */
export function StartPage() {
  const isMobile = useIsMobile();
  const getSidekickHref = isMobile ? "#send-link" : "#get";
  const { data: landing, isError: landingFailed } = useLandingFeatured();
  const { data: siteConfig } = useSiteConfig();
  const siteName = (siteConfig?.tenant?.branding ?? siteConfig?.branding)?.display_name;
  // The montage's runs (a payload from before montages has the one featured run).
  const runs = useMemo(() => landing?.entries?.length ? landing.entries : landing?.featured ? [landing.featured] : [], [landing]);
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
  const holding = bossPick?.hold ?? false;
  const advanceHero = useCallback(() => {
    if (holding) return;
    setHeroIndex((index) => index + 1);
    setBossPick(null);
  }, [holding]);
  // The scrubber and caption follow the entry playing, spanning its pull only.
  const current = heroes.length > 0 ? heroIndex % heroes.length : -1;
  const hero = current >= 0 ? heroes[current] : null;
  const pickBoss = useCallback((encounterId: string) => setBossPick({ index: current, encounterId, hold: true }), [current]);
  const releaseHold = useCallback(() => setBossPick((pick) => pick && { ...pick, hold: false }), []);
  // The hero and its boss rail: scrolling it away releases a held pick.
  const replaySectionRef = useRef<HTMLDivElement>(null);
  // The live 3D replay's position and controls, for the hero's scrubber; null while the poster shows.
  const [replay, setReplay] = useState<HeroReplay | null>(null);

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

  // Our hero now covers the static poster index.html painted before the bundle loaded.
  useLayoutEffect(() => {
    document.getElementById("start-poster-shell")?.remove();
  }, []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      <LandingNav getSidekickHref={getSidekickHref} />
      <div ref={replaySectionRef}>
        <LandingHero
          poster={`${IMAGES}/ruins-courtyard-poster.jpg`}
          posterPortrait={`${IMAGES}/ruins-courtyard-poster-portrait.jpg`}
          posterAlt="3D replay: a five-player group fighting on the stone platform in the Ruins of Lordaeron courtyard"
          featured={hero?.run}
          currentMs={replay?.currentMs}
          playback={replay}
          getSidekickHref={getSidekickHref}
          stats={isMobile ? null : replay?.renderStats?.("column")}
          layer3D={landing || landingFailed ? <HeroReplayLayer entries={heroEntries} index={heroIndex} onAdvance={advanceHero} onReplay={setReplay} /> : null}
        />
        {isMobile && replay?.renderStats?.("strip")}
        <BossRail
          bosses={landing || landingFailed ? runs[current]?.bosses ?? [] : undefined}
          selectedId={hero?.window?.encounterId ?? null}
          onPick={pickBoss}
        />
      </div>
      <SendLinkSection />
      <HowItWorks />
      <BelowFold />
      <footer className="mt-auto flex flex-wrap gap-3 border-t px-4 py-3.5 text-[11px] text-muted-foreground lg:gap-[18px] lg:px-8 lg:py-[18px] lg:text-xs">
        <span>{siteName ? `Chronicle for ${siteName}` : "Chronicle"}</span>
        {FOOTER_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="text-link hover:underline">
            {link.label}
          </Link>
        ))}
      </footer>
    </div>
  );
}
