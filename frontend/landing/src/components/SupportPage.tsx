import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Coffee,
  ExternalLink,
  ScrollText,
} from "lucide-react";
import { CryptoCoinIcon, PatreonIcon, SponsorsHeartIcon } from "./BrandIcons";
import { CryptoTipModal } from "./CryptoTipModal";

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/Emyrk";
const PATREON_URL = "https://www.patreon.com/cw/ChronicleClassic";
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/chronicleclassic";


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

// Game icons for the hosting cost rows, mirroring the app's class/spec icons.
const ICON_FOR_COST: Record<string, string> = {
  Memory: "spell_shadow_manaburn",
  Network: "spell_nature_lightning",
  Storage: "inv_crate_02",
  CPU: "inv_misc_gear_01",
  Backups: "inv_shield_04",
};

const PARCHMENT_BG = "radial-gradient(ellipse at 30% 15%, #ead9ae 0%, #d3ba8c 55%, #bda276 100%)";

const HOSTING_QUESTS = [
  {
    title: "Hosted by Chronicle",
    badge: true,
    body: "Chronicle operates these deployments directly — infrastructure, hosting, and service costs are covered by the project. These are the zones of the mainland.",
    objective: "Keep every mainland realm online",
    status: "Ongoing",
  },
  {
    title: "Community Hosted",
    badge: false,
    body: "Independent communities run Chronicle on their own infrastructure. Same open-source project, their own hosting — the isles across the strait.",
    objective: "Sail your own shores",
    status: "Complete",
  },
];

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

// Donation methods as spells: the spellbook and the floating action bar share
// this list. href opens a link; no href casts the crypto modal.
const DONATION_SPELLS = [
  {
    label: "GitHub Sponsors",
    subtitle: "Recurring",
    href: GITHUB_SPONSORS_URL,
    accent: "#ec4899",
    icon: <SponsorsHeartIcon className="h-6 w-6 text-pink-400" />,
    cost: "Any amount of gold",
    cast: "Instant cast",
    desc: "Sponsor Chronicle through GitHub, one-time or monthly. Grants Sustained Hosting to all realms. Stacks with other donors.",
  },
  {
    label: "Patreon",
    subtitle: "Monthly",
    href: PATREON_URL,
    accent: "#FF424D",
    icon: <PatreonIcon className="h-6 w-6 text-[#FF424D]" />,
    cost: "Monthly pledge",
    cast: "Channeled",
    desc: "Sustains hosting and development while channeled. Interrupting the channel is allowed — no harm done.",
  },
  {
    label: "Buy Me a Coffee",
    subtitle: "Instant",
    href: BUY_ME_A_COFFEE_URL,
    accent: "#facc15",
    icon: <Coffee aria-hidden="true" className="h-6 w-6 text-yellow-400" />,
    cost: "A few gold",
    cast: "Instant cast",
    desc: "A quick one-time thank-you. Restores the developer's mana. May cause caffeination.",
  },
  {
    label: "Tip with Crypto",
    subtitle: "Summon",
    accent: "#fbbf24",
    icon: <CryptoCoinIcon className="h-6 w-6 text-amber-400" />,
    cost: "Reagents: BTC, ETH, SOL…",
    cast: "Instant cast",
    desc: "Summons a window of wallet addresses. The summoned window persists until dismissed.",
  },
];

function MoneyBagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.2 6.2 7.6 3.6c-.4-.6 0-1.4.8-1.4h7.2c.8 0 1.2.8.8 1.4l-1.6 2.6c-.3.5-.8.8-1.4.8h-2.8c-.6 0-1.1-.3-1.4-.8z" />
      <path d="M9 8.4h6c3.4 2.1 5.5 5.1 5.5 8 0 3.6-3.1 5.6-8.5 5.6S3.5 20 3.5 16.4c0-2.9 2.1-5.9 5.5-8z" />
      <text
        x="12"
        y="17.6"
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        fill="oklch(0.2686 0 0)"
        stroke="none"
      >
        $
      </text>
    </svg>
  );
}

type DonationSpell = (typeof DONATION_SPELLS)[number];

/** WoW-style spell tooltip: name, cost and cast lines in white, gold description. */
function SpellTooltip({ spell, className }: { spell: DonationSpell; className: string }) {
  return (
    <span
      role="tooltip"
      className={
        "pointer-events-none absolute z-20 w-60 rounded-lg border-2 border-[#4a4a6a] bg-[#1a1a2e] p-2.5 text-left font-wow text-xs leading-snug opacity-0 shadow-xl shadow-black/60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 " +
        className
      }
    >
      <span className="block text-sm font-medium leading-tight text-white">{spell.label}</span>
      <span className="block text-white">{spell.cost}</span>
      <span className="block text-white">{spell.cast}</span>
      <span className="mt-1 block text-[#ffd200]">{spell.desc}</span>
    </span>
  );
}

const SPELLBOOK_ROW_CLASSES =
  "group relative -mx-2 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1 text-left transition-colors hover:bg-black/10 focus-visible:bg-black/10 focus-visible:outline-none";

function SpellbookRow({ spell, external }: { spell: DonationSpell; external: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded border-2 border-[#8a6a2a] shadow-md shadow-black/40"
        style={{ background: `radial-gradient(circle at 35% 30%, ${spell.accent}40, #14141f 75%)` }}
      >
        {spell.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-wow text-[17px] font-bold leading-tight text-[#215c10]">
          {spell.label}
        </span>
        <span className="block font-wow text-xs leading-tight text-[#7a5c36]">
          {spell.subtitle}
        </span>
      </span>
      {external && (
        <ExternalLink
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-[#7a5c36] opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70"
        />
      )}
      <SpellTooltip spell={spell} className="bottom-full left-0 mb-1" />
    </>
  );
}

const ACTION_SLOT_CLASSES =
  "group relative block h-12 w-12 cursor-pointer rounded border-2 border-[#5a5a7a] bg-black outline-none transition-transform hover:scale-105 hover:border-yellow-500/80 focus-visible:scale-105 focus-visible:border-yellow-500/80";

/** Stone gryphon statues flanking the bar, like the classic action bar end caps. */
function GryphonEndCap({ side }: { side: "left" | "right" }) {
  return (
    <img
      src="/gryphon.webp"
      alt=""
      aria-hidden="true"
      className={
        "pointer-events-none absolute bottom-0 h-12 w-auto drop-shadow-[0_4px_6px_rgba(0,0,0,0.6)] sm:h-[4.75rem] " +
        (side === "left" ? "right-full -mr-6 sm:-mr-5" : "left-full -ml-6 sm:-ml-5 -scale-x-100")
      }
    />
  );
}

function ActionSlotContent({ spell, keybind }: { spell: DonationSpell; keybind: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex h-full w-full items-center justify-center rounded-sm"
        style={{ background: `radial-gradient(circle at 35% 30%, ${spell.accent}40, #14141f 75%)` }}
      >
        {spell.icon}
      </span>
      <span
        aria-hidden="true"
        className="absolute right-0.5 top-0 text-[10px] font-bold text-white [text-shadow:1px_1px_1px_#000]"
      >
        {keybind}
      </span>
      <SpellTooltip spell={spell} className="bottom-full left-1/2 mb-2 -translate-x-1/2" />
    </>
  );
}

export function SupportPage() {
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [actionBarVisible, setActionBarVisible] = useState(false);

  useEffect(() => {
    if (!mapOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mapOpen]);

  useEffect(() => {
    const onScroll = () => setActionBarVisible(window.scrollY > 300);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_at_top,_var(--primary-darker)_0%,_transparent_65%)] opacity-50" />

      <a
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to server directory
      </a>

      <div className="mx-auto mt-6 max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
          Keeping Chronicle available to WoW communities
        </h1>
      </div>

      <div className="mt-10 rounded-xl border-2 border-[#6b5320] bg-[#1e1710] shadow-2xl shadow-black/40">
        <div className="flex items-center gap-3 rounded-t-[10px] border-b-2 border-[#6b5320] px-4 py-2.5">
          <BookOpen aria-hidden="true" className="h-4 w-4 text-[#f0c060]" />
          <h2 className="flex-1 text-center font-wow text-base font-bold tracking-[0.08em] text-[#f0c060]">
            Support the Project
          </h2>
          <span aria-hidden="true" className="h-4 w-4" />
        </div>
        <div
          className="relative rounded-b-[10px] px-5 py-4 sm:px-8 sm:py-5"
          style={{ background: PARCHMENT_BG }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-bl-[10px] bg-gradient-to-r from-[#8a704a]/60 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-4 rounded-br-[10px] bg-gradient-to-l from-[#8a704a]/35 to-transparent"
          />
          <p className="relative mx-auto max-w-md text-center font-wow text-sm italic leading-snug text-[#6b5330]">
            Contributions help cover hosting for Chronicle-operated deployments and
            support continued development. Support is appreciated, never required.
          </p>
          <div className="relative mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {DONATION_SPELLS.map((spell) =>
              spell.href ? (
                <a
                  key={spell.label}
                  href={spell.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={SPELLBOOK_ROW_CLASSES}
                >
                  <SpellbookRow spell={spell} external />
                </a>
              ) : (
                <button
                  key={spell.label}
                  type="button"
                  onClick={() => setCryptoModalOpen(true)}
                  className={SPELLBOOK_ROW_CLASSES}
                >
                  <SpellbookRow spell={spell} external={false} />
                </button>
              ),
            )}
          </div>
          <div className="relative mt-4 flex items-center justify-end gap-2">
            <span className="font-wow text-sm italic text-[#6b5330]">Page 1</span>
            <span
              aria-hidden="true"
              className="flex h-5 w-5 items-center justify-center rounded-sm border border-[#8a6a2a] bg-[#c9963e]/60 text-[11px] font-bold leading-none text-[#3a2c10] opacity-60"
            >
              ‹
            </span>
            <span
              aria-hidden="true"
              className="flex h-5 w-5 items-center justify-center rounded-sm border border-[#8a6a2a] bg-[#c9963e]/60 text-[11px] font-bold leading-none text-[#3a2c10] opacity-60"
            >
              ›
            </span>
          </div>
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

      <div className="relative mt-12 rounded-lg border border-border bg-card shadow-2xl shadow-black/50 ring-1 ring-white/10">
        <img
          src="/goblin.webp"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full right-2 -mb-5 h-24 w-auto drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] sm:right-6 sm:-mb-7 sm:h-32"
        />
        <div className="flex items-center gap-2 rounded-t-lg border-b border-border bg-[oklch(0.36_0_0)] px-2.5 py-1.5">
          <MoneyBagIcon className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-medium text-foreground">Hosting Bill</h2>
          <span className="ml-auto text-xs text-muted-foreground">Overall Cost</span>
        </div>
        <ul className="flex flex-col gap-0.5 p-1">
          {HOSTING_METER.map(({ label, pct, color, note, why, source }, i) => {
            const maxPct = HOSTING_METER[0].pct;
            return (
              <li
                key={label}
                tabIndex={0}
                className="group relative flex h-[30px] items-center overflow-visible rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="absolute inset-0 overflow-hidden rounded-lg">
                  <div
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 top-0 opacity-85"
                    style={{
                      width: `${(pct / maxPct) * 100}%`,
                      background: `linear-gradient(to right, oklch(0 0 0 / 0.3), oklch(0 0 0 / 0.15)), ${color}`,
                    }}
                  />
                </div>
                <div className="relative z-[1] flex w-full items-center px-3">
                  <span className="w-8 text-[13px] font-medium">#{i + 1}</span>
                  <img
                    src={`${WOW_ICON_BASE}/${ICON_FOR_COST[label]}.webp`}
                    alt=""
                    aria-hidden="true"
                    width={24}
                    height={24}
                    className="mr-2 h-6 w-6 shrink-0 rounded-[3px]"
                  />
                  <span className="min-w-0 truncate text-[13px] font-medium">{label}</span>
                  <span className="min-w-0 flex-1" />
                  <span className="mr-3 rounded bg-[oklch(0.205_0_0/0.7)] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums">
                    {note}
                  </span>
                  <span className="w-[50px] text-right font-mono text-xs font-medium tabular-nums text-muted-foreground">
                    {pct.toFixed(2)}%
                  </span>
                </div>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-6 z-20 mb-1 w-72 rounded-md border-2 bg-card text-left text-xs leading-relaxed text-muted-foreground opacity-0 shadow-xl shadow-black/40 transition-opacity group-focus-visible:opacity-100 group-hover:opacity-100"
                  style={{ borderColor: `color-mix(in oklch, ${color} 60%, transparent)` }}
                >
                  <div className="flex items-center gap-2 border-b border-border p-2.5">
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="ml-auto text-muted-foreground">{note}</span>
                  </div>
                  <div className="p-2.5">
                    <ul className="list-disc space-y-1 pl-4">
                      {why.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <div className="mt-2 border-t border-border pt-2">
                      <span className="font-semibold text-foreground/80">Source: </span>
                      {source}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-foreground">Who runs each server?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Whoever hosts a server bears the costs of running its logging site.
      </p>
      <figure className="mt-5">
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          aria-label="View server map full screen"
          className="block w-full cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          <img
            src="/chronmap.webp"
            alt="Fantasy world map. The mainland, labeled Hosted by Chronicle, holds realms whose deployments Chronicle operates and pays for. The isles to the east, labeled Community Hosted, are deployments run by independent communities on their own infrastructure. Banner: Different shores. Shared purpose. One Chronicle."
            className="w-full rounded-xl border-2 border-[#4a4a6a] shadow-2xl shadow-black/40"
          />
        </button>
        <figcaption className="mt-2 text-center text-xs italic text-muted-foreground">
          image courtesy of our robot friends
        </figcaption>
      </figure>

      <div className="mt-6 rounded-xl border-2 border-[#6b5320] bg-[#1e1710] shadow-2xl shadow-black/40">
        <div className="flex items-center gap-3 rounded-t-[10px] border-b-2 border-[#6b5320] px-4 py-2.5">
          <ScrollText aria-hidden="true" className="h-4 w-4 text-[#f0c060]" />
          <h3 className="flex-1 text-center font-wow text-base font-bold tracking-[0.08em] text-[#f0c060]">
            Quest Log
          </h3>
          <span aria-hidden="true" className="h-4 w-4" />
        </div>
        <div
          className="relative rounded-b-[10px] px-5 py-4 sm:px-8 sm:py-5"
          style={{ background: PARCHMENT_BG }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-bl-[10px] bg-gradient-to-r from-[#8a704a]/60 to-transparent"
          />
          <div className="relative grid gap-x-8 gap-y-4 font-wow sm:grid-cols-2">
            {HOSTING_QUESTS.map(({ title, body, objective, status, badge }) => (
              <article key={title}>
                <h4 className="text-[19px] font-bold leading-tight text-[#5a3c10]">{title}</h4>
                <p className="mt-1 text-[15px] leading-snug text-[#4a3520]">{body}</p>
                <p className="mt-2 text-[13px] font-bold text-[#6b5330]">Objectives</p>
                <p className="text-[15px] leading-snug text-[#4a3520]">
                  {objective}
                  <span className="italic text-[#7a5c36]"> — {status}</span>
                </p>
                {badge && (
                  <>
                    <p className="mt-2 text-[13px] font-bold text-[#6b5330]">Rewards</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-[#101a2c] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-300">
                        <span aria-hidden="true">◆</span>
                        Hosted by Chronicle
                      </span>
                    </p>
                  </>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>

      {mapOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Server map"
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-8"
          onClick={() => setMapOpen(false)}
        >
          <img
            src="/chronmap.webp"
            alt=""
            className="max-h-full max-w-full rounded-lg shadow-2xl shadow-black/60"
          />
          <button
            type="button"
            autoFocus
            onClick={() => setMapOpen(false)}
            aria-label="Close map"
            className="absolute right-4 top-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-black/60 text-lg text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            ✕
          </button>
        </div>
      )}

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
            {DONATION_SPELLS.map((spell, i) =>
              spell.href ? (
                <a
                  key={spell.label}
                  href={spell.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={spell.label}
                  className={ACTION_SLOT_CLASSES}
                >
                  <ActionSlotContent spell={spell} keybind={i + 1} />
                </a>
              ) : (
                <button
                  key={spell.label}
                  type="button"
                  onClick={() => setCryptoModalOpen(true)}
                  aria-label={spell.label}
                  className={ACTION_SLOT_CLASSES}
                >
                  <ActionSlotContent spell={spell} keybind={i + 1} />
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
