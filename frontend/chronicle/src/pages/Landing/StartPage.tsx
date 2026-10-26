import { lazy, Suspense, useLayoutEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useLandingFeatured } from "@/api/queries";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRecentUploads } from "@/pages/Recent/recentUploads";
import { LandingHero } from "./LandingHero";

// Recent runs render below the fold once their fetch returns; keeping RaidCard (and its
// icon and helper chunks) out of the static graph keeps them off /start's first paint.
const RaidCard = lazy(() => import("@/pages/Recent/RaidCard").then(({ RaidCard }) => ({ default: RaidCard })));

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";
// Public Sidekick downloads; the utm cookie set on landing carries attribution.
const DOWNLOAD_MAC_URL = "/download?os=macos";
const DOWNLOAD_WINDOWS_URL = "/download?os=windows";

const IMAGES = "/c/images/landing";
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

// Static shelf until the dungeon-manifest car replaces it.
const DUNGEONS: { name: string; kind: "3d" | "2d" | "coming" }[] = [
  { name: "Ruins of Lordaeron", kind: "3d" },
  { name: "Wailing Caverns", kind: "3d" },
  { name: "Ragefire Chasm", kind: "3d" },
  { name: "Zul'Gurub", kind: "3d" },
  { name: "Molten Core", kind: "3d" },
  { name: "Excavation Site", kind: "2d" },
  { name: "The Deadmines", kind: "coming" },
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

function RecentRuns({ getSidekickHref }: { getSidekickHref: string }) {
  const { data } = useRecentUploads();
  const runs = (data?.instances ?? []).slice(0, 3);

  return (
    <section id="runs" className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-3.5 px-4 pb-3 pt-7 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className={`m-0 text-xl font-bold lg:text-2xl ${HEADING_FONT}`}>Recent runs</h2>
        <Link to="/recent" className="text-sm text-[#4fd1c5] hover:text-[#8ee6dd]">
          All recent runs
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={null}>
          {runs.map((run) => (
            <RaidCard key={run.id} instance={run} />
          ))}
        </Suspense>
        <a
          href={getSidekickHref}
          className="flex min-h-[160px] flex-col justify-center gap-1.5 rounded-xl border border-dashed border-[#5f6d88] bg-[#101829] p-4 text-center text-[#e8eef8] no-underline hover:border-[#e0b45c]"
        >
          <div className={`text-lg font-bold ${HEADING_FONT}`}>Your run goes here</div>
          <div className="text-xs text-[#b7c2d6]">Tonight, if Sidekick is running.</div>
          <div className="mt-2 text-[15px] font-semibold text-[#e0b45c]">Get Sidekick →</div>
        </a>
      </div>
    </section>
  );
}

function DungeonShelf() {
  return (
    <section id="dungeons" className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-3.5 px-4 pb-9 pt-7 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className={`m-0 text-xl font-bold lg:text-2xl ${HEADING_FONT}`}>Real floors, not dots on a map</h2>
        <Link to="/supported" className="text-sm text-[#4fd1c5] hover:text-[#8ee6dd]">
          All supported instances
        </Link>
      </div>
      <ul className="styled-scrollbar m-0 flex list-none gap-3 overflow-x-auto p-0 pb-1.5">
        {DUNGEONS.map((d) => (
          <li
            key={d.name}
            className={`flex shrink-0 basis-[190px] flex-col gap-1 rounded-[10px] border bg-[#141d30] p-3.5 ${
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
  const { data: landing } = useLandingFeatured();

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
        getSidekickHref={getSidekickHref}
      />
      <SendLinkSection />
      <HowItWorks />
      <FirstMinute />
      <RecentRuns getSidekickHref={getSidekickHref} />
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
