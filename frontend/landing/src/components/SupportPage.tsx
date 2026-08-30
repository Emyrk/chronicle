import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CircleHelp,
  Coffee,
  ExternalLink,
  Heart,
  Server,
  ShieldCheck,
  Skull,
} from "lucide-react";
import { CryptoCoinIcon, PatreonIcon, SponsorsHeartIcon } from "./BrandIcons";
import { CryptoTipModal } from "./CryptoTipModal";

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/Emyrk";
const PATREON_URL = "https://www.patreon.com/cw/ChronicleClassic";
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/chronicleclassic";

const DONATION_LINKS = [
  {
    label: "GitHub Sponsors",
    href: GITHUB_SPONSORS_URL,
    icon: <SponsorsHeartIcon className="h-4 w-4 text-pink-400" />,
  },
  {
    label: "Patreon",
    href: PATREON_URL,
    icon: <PatreonIcon className="h-4 w-4 text-[#FF424D]" />,
  },
  {
    label: "Buy Me a Coffee",
    href: BUY_ME_A_COFFEE_URL,
    icon: <Coffee aria-hidden="true" className="h-4 w-4 text-yellow-400" />,
  },
];

const HOSTING_METER = [
  {
    label: "Memory",
    pct: 65,
    color: "#f0a020",
    note: "Largest",
    why: [
      "Parsing requires loading the full uncompressed log into memory — and logs are large.",
      "Caches for frequently asked-for spells, items, and the like keep the experience snappy.",
      "The API serves a lot of data, all of which routes through memory.",
    ],
    source: "RAM allocation on the machines running Chronicle deployments.",
  },
  {
    label: "Network",
    pct: 15,
    color: "#7fb8e8",
    note: "Small",
    why: [
      "Combat log uploads coming in.",
      "Dashboards, charts, API responses, and log events going out.",
      "The frontend receives all the log events for the detailed analysis.",
    ],
    source: "The provider's data transfer (egress) charges.",
  },
  {
    label: "Storage",
    pct: 13,
    color: "#9ed36a",
    note: "Small",
    why: [
      "Every uploaded log and its parsed history stays available to browse.",
      "The archive only grows over time.",
    ],
    source: "Disk volumes backing the database and log storage.",
  },
  {
    label: "CPU",
    pct: 6,
    color: "#a98ee8",
    note: "Minimal",
    why: [
      "Parsing a log is a short burst of compute at upload time.",
      "Outside uploads, the processors are mostly idle.",
    ],
    source: "The compute portion of the server instances.",
  },
  {
    label: "Backups",
    pct: 1,
    color: "#8a6a2a",
    note: "Minimal",
    why: [
      "Regular offsite snapshots protect the database so no one's log history is lost.",
    ],
    source: "Snapshot and object storage fees.",
  },
];

const WOW_ICON_BASE = "https://icons.chronicleclassic.com/turtle";

// WoW item quality colors (matches chronicle's --color-quality-* tokens).
const QUALITY = {
  uncommon: "#1eff00",
  rare: "#0070dd",
  epic: "#a335ee",
  legendary: "#ff8000",
};

const WHY_DONATE_ITEMS = [
  {
    title: "Servers aren't free",
    quality: QUALITY.legendary,
    icon: "inv_misc_gear_01",
    slot: "Community Perk",
    subtype: "Infrastructure",
    equip: [
      "Equip: Covers hosting, storage, and infrastructure for Chronicle-operated deployments, paid out of pocket every month.",
      "Use: Consumes gold at the start of each month. (30 day cooldown.)",
    ],
    flavor: "The real gold sink was infrastructure all along.",
  },
  {
    title: "Keep Chronicle ad-free",
    quality: QUALITY.epic,
    icon: "spell_holy_silence",
    slot: "Community Perk",
    subtype: "Aura",
    equip: [
      "Equip: Grants immunity to banner ads, pop-ups, and tracking effects.",
      "Use: Dispels one attempted monetization scheme."
    ],
    flavor: "The only things tracking you should be threat meters.",
  },
  {
    title: "Keep Chronicle paywall-free",
    quality: QUALITY.rare,
    icon: "inv_misc_key_03",
    slot: "Community Perk",
    subtype: "Key",
    equip: [
      "Equip: Removes the “Premium Account Required” debuff.",
      "Use: Opens all Chronicle content. No key required."
    ],
    flavor: "No attunement required.",
  },
  {
    title: "Sustain development",
    quality: QUALITY.uncommon,
    icon: "inv_misc_wrench_01",
    slot: "Community Perk",
    subtype: "Tool",
    equip: [
      "Equip: Increases time spent on fixes, new features, and keeping up with the game.",
      "Chance on hit: A new feature ships.",
    ],
    flavor: "Warning: may cause additional features.",
  },
];

const DONATION_BUTTON_CLASSES =
  "inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-5 py-3 text-base font-semibold text-foreground transition-colors hover:border-pink-300/60 hover:bg-muted";

// Spells on the floating action bar; href opens a link, no href casts the crypto modal.
const ACTION_BAR_SPELLS = [
  { label: "GitHub Sponsors", icon: "spell_holy_sealofsacrifice", href: GITHUB_SPONSORS_URL },
  { label: "Patreon", icon: "inv_banner_02", href: PATREON_URL },
  { label: "Buy Me a Coffee", icon: "inv_drink_04", href: BUY_ME_A_COFFEE_URL },
  { label: "Tip with Crypto", icon: "inv_misc_coin_01" },
];

const ACTION_SLOT_CLASSES =
  "group relative block h-12 w-12 rounded border-2 border-[#5a5a7a] bg-black outline-none transition-transform hover:scale-105 hover:border-yellow-500/80 focus-visible:scale-105 focus-visible:border-yellow-500/80";

/** Stone gryphon statues flanking the bar, like the classic action bar end caps. */
function GryphonEndCap({ side }: { side: "left" | "right" }) {
  return (
    <img
      src="/gryphon.webp"
      alt=""
      aria-hidden="true"
      className={
        "pointer-events-none absolute bottom-0 hidden h-[4.75rem] w-auto drop-shadow-[0_4px_6px_rgba(0,0,0,0.6)] sm:block " +
        (side === "left" ? "right-full -mr-5" : "left-full -ml-5 -scale-x-100")
      }
    />
  );
}

function ActionSlotContent({ label, icon, keybind }: { label: string; icon: string; keybind: number }) {
  return (
    <>
      <img
        src={`${WOW_ICON_BASE}/${icon}.webp`}
        alt=""
        aria-hidden="true"
        className="h-full w-full rounded-sm object-cover"
      />
      <span
        aria-hidden="true"
        className="absolute right-0.5 top-0 text-[10px] font-bold text-white [text-shadow:1px_1px_1px_#000]"
      >
        {keybind}
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded border border-[#4a4a6a] bg-[#1a1a2e] px-2.5 py-1.5 text-left opacity-0 shadow-lg shadow-black/50 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="block text-xs font-semibold text-white">{label}</span>
        <span className="block text-[10px] text-[#ffd200]">Instant cast</span>
      </span>
    </>
  );
}

export function SupportPage() {
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [actionBarVisible, setActionBarVisible] = useState(false);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      // Only summon the bar once the donation card has scrolled off the top.
      setActionBarVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_at_top,_var(--primary-darker)_0%,_transparent_65%)] opacity-50" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to server directory
        </a>
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-300">
          <span aria-hidden="true">◆</span>
          Hosted by Chronicle
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
          Keeping Chronicle available to WoW communities
        </h1>
      </div>

      <div
        ref={ctaRef}
        className="mt-10 rounded-xl border border-pink-400/25 bg-card p-6 text-center shadow-lg shadow-pink-950/10 sm:p-10"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-400/10 text-pink-300">
          <Heart aria-hidden="true" className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">Support the project</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Contributions help cover hosting for Chronicle-operated deployments
          and support continued development. Support is appreciated, never required.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {DONATION_LINKS.map(({ label, href, icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={DONATION_BUTTON_CLASSES}
            >
              {icon}
              {label}
              <ExternalLink aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            </a>
          ))}
          <button
            type="button"
            onClick={() => setCryptoModalOpen(true)}
            className={DONATION_BUTTON_CLASSES}
          >
            <CryptoCoinIcon className="h-4 w-4 text-amber-400" />
            Tip with Crypto
          </button>
        </div>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-foreground">Why donate?</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {WHY_DONATE_ITEMS.map(({ title, quality, icon, slot, subtype, equip, flavor }) => (
          <article
            key={title}
            className="rounded-lg border-2 border-[#4a4a6a] bg-[#1a1a2e] p-3 text-xs leading-snug shadow-lg"
          >
            <div className="flex items-start gap-3">
              <img
                src={`${WOW_ICON_BASE}/${icon}.webp`}
                alt=""
                aria-hidden="true"
                width={44}
                height={44}
                className="shrink-0 rounded border-2 border-yellow-600/60"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium leading-tight" style={{ color: quality }}>
                  {title}
                </h3>
              </div>
            </div>
            <div className="mt-2 space-y-0.5">
              <div className="text-white">Binds when Contributed</div>
              <div className="flex justify-between text-white">
                <span>{slot}</span>
                <span>{subtype}</span>
              </div>
              {equip.map((line) => (
                <div key={line} style={{ color: QUALITY.uncommon }}>
                  {line}
                </div>
              ))}
              <div className="mt-1 pt-1 text-[#ffd200]">&ldquo;{flavor}&rdquo;</div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Chronicle — Combat Log
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-3">
            <Skull aria-hidden="true" className="h-6 w-6 text-amber-400" />
            <h2 className="text-xl font-bold text-amber-400">Hosting Bill</h2>
          </div>
          <span className="text-sm text-muted-foreground">Overall Damage Done</span>
        </div>
        <div aria-hidden="true" className="mt-4 flex h-6 w-full overflow-hidden rounded-sm">
          {HOSTING_METER.map(({ label, pct, color }) => (
            <div key={label} style={{ flexGrow: pct, background: color }} />
          ))}
        </div>
        <ul className="mt-5 space-y-2.5 font-mono text-sm">
          {HOSTING_METER.map(({ label, pct, color, note, why, source }) => (
            <li key={label} className="flex items-center gap-3">
              <span aria-hidden="true" className="h-3 w-3 shrink-0" style={{ background: color }} />
              <span style={{ color }}>{label}</span>
              <span className="group relative inline-flex">
                <button
                  type="button"
                  aria-label={`About ${label} costs`}
                  className="text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                >
                  <CircleHelp aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-64 rounded-md border border-border bg-card p-3 text-left font-sans text-xs leading-relaxed text-muted-foreground opacity-0 shadow-xl shadow-black/40 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:w-72"
                >
                  <div className="font-semibold" style={{ color }}>
                    {label}
                  </div>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4">
                    {why.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <div className="mt-2 border-t border-border pt-2">
                    <span className="font-semibold text-foreground/80">Source: </span>
                    {source}
                  </div>
                </div>
              </span>
              <span className="ml-auto whitespace-nowrap text-muted-foreground">
                {pct}% of total damage
              </span>
              <span className="hidden w-20 text-right text-muted-foreground sm:inline">{note}</span>
            </li>
          ))}
        </ul>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-foreground">Who runs each deployment?</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <article className="rounded-xl border border-sky-400/30 bg-card/90 p-6 shadow-lg shadow-sky-950/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-400/10 text-sky-300">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Hosted by Chronicle</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            I operate the deployment and cover its infrastructure costs. The badge
            identifies communities whose Chronicle service depends directly on the
            project&apos;s hosting budget and maintenance.
          </p>
        </article>

        <article className="rounded-xl border border-border bg-card/70 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Server aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Community hosted</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            These communities run Chronicle on their own infrastructure. They still
            use the same open-source project, but their operators handle hosting and
            service costs independently.
          </p>
        </article>
      </div>

      <nav
        aria-label="Donation quick bar"
        className={
          "fixed bottom-3 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 " +
          (actionBarVisible ? "visible translate-y-0 opacity-100" : "invisible translate-y-8 opacity-0")
        }
      >
        <div className="relative">
          <GryphonEndCap side="left" />
          <GryphonEndCap side="right" />
          <div className="flex items-end gap-1.5 rounded-lg border-2 border-[#4a4a6a] bg-[#1a1a2e]/95 p-2 shadow-2xl shadow-black/60">
            {ACTION_BAR_SPELLS.map(({ label, icon, href }, i) =>
              href ? (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={ACTION_SLOT_CLASSES}
                >
                  <ActionSlotContent label={label} icon={icon} keybind={i + 1} />
                </a>
              ) : (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCryptoModalOpen(true)}
                  aria-label={label}
                  className={ACTION_SLOT_CLASSES}
                >
                  <ActionSlotContent label={label} icon={icon} keybind={i + 1} />
                </button>
              ),
            )}
          </div>
        </div>
      </nav>

      <CryptoTipModal open={cryptoModalOpen} onClose={() => setCryptoModalOpen(false)} />
    </section>
  );
}
