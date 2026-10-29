import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useLandingFeatured } from "@/api/landingFeatured";
import { useIsMobile } from "@/hooks/useIsMobile";
import { trackFunnel } from "@/utils/funnel";
import { HeroReplayLayer } from "./HeroReplayLayer";
import { heroWindow, type HeroReplay } from "./heroReplay";
import { LandingHero } from "./LandingHero";
import { HEADING_FONT, IMAGES } from "./startPageStyle";
import { whenIdle } from "./whenIdle";

// The sections below how-it-works and their queries: requested only once the trigger in BelowFold fires.
const StartBelowFold = lazy(() => import("./StartBelowFold"));

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";

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
          onClick={() => trackFunnel("cta_sidekick", { placement: "nav" })}
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
  // The 3D hero replays the featured run (the build-time instance when none is set); undefined until that is known.
  const heroInstanceId = landing || landingFailed ? landing?.featured?.instance_id ?? FALLBACK_FEATURED_INSTANCE : undefined;
  // It loops the featured run's boss pull; the scrubber spans that pull only.
  const hero = useMemo(() => (landing?.featured ? heroWindow(landing.featured) : null), [landing]);
  // The live 3D replay's position and controls, for the hero's scrubber; null while the poster shows.
  const [replay, setReplay] = useState<HeroReplay | null>(null);

  // The funnel's denominator: one per visit to /start, with its campaign.
  useEffect(() => trackFunnel("land"), []);

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
        featured={hero?.run}
        currentMs={replay?.currentMs}
        playback={replay}
        getSidekickHref={getSidekickHref}
        layer3D={landing || landingFailed ? <HeroReplayLayer instanceId={heroInstanceId} pull={hero?.window} onReplay={setReplay} /> : null}
      />
      <SendLinkSection />
      <HowItWorks />
      <BelowFold />
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
