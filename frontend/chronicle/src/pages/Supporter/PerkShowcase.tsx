import { useEffect, useRef } from "react"
import type { ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Activity, Check, Download, ExternalLink, FileText, LockKeyhole, Map as MapIcon, Plus, Shield, Sparkles, Swords, Timer, Trophy, Users } from "lucide-react"
import { BACKGROUND_STYLES, BORDER_STYLES, COSMETIC_CSS, NAME_STYLES, TIER_RANK, combineCosmetics, tierFromAPI, type Preset } from "@/components/ui/PlayerMetricChart/PlayerCosmetics"
import { MiniRow } from "@/features/characterCosmetics/CharacterCosmeticsEditor"
import { TierPill } from "@/components/Supporter/Supporter"
import type { SupporterPerk } from "@/components/Supporter/supporterUpsell"
import { cn } from "@/lib/utils"
import { UnlistedBadge } from "@/pages/Logs/components/UnlistedBadge"
import { COSMETIC_SHOWCASE, PAID_BILLING_TIERS, TIER_COLOR, billingTierLabel, billingTierStorageLabel, type PaidBillingTier } from "@/pages/Settings/billingPricing"

const PANEL = "rounded-lg border border-border bg-card shadow-2xl shadow-black/40 ring-1 ring-white/10"

/** "free" is the Friendly standing everyone has. */
type SlideTier = PaidBillingTier | "free"

const FRIENDLY_COLOR = "#e4e4e7"

function slideColor(tier: SlideTier): string {
  return tier === "free" ? FRIENDLY_COLOR : TIER_COLOR[tier]
}

interface PerkSlide {
  id: SupporterPerk
  tab: string
  tier: SlideTier
  headline: string
  body: string
  /** What each standing gets for this perk, lowest first; omitted on the Friendly slide itself. */
  levels?: { tier: SlideTier; text: string }[]
  visual: ReactNode
}

const PLAIN_COSMETIC = combineCosmetics({ name: "none", background: "none", border: "none" })

const COSMETIC_PLAYGROUND_PATH = "/technical/cosmetic"

/** The cosmetic slot each tier adds on top of the ones below it. */
const COSMETIC_SLOT: Record<PaidBillingTier, { label: string; styles: Record<string, Preset> }> = {
  honored: { label: "Name styles", styles: NAME_STYLES },
  revered: { label: "+ Backgrounds", styles: BACKGROUND_STYLES },
  exalted: { label: "+ Borders", styles: BORDER_STYLES },
}

/** Paid presets in a slot that a tier can use, so the counts track the cosmetics catalog. */
function slotStyleCount(styles: Record<string, Preset>, tier: PaidBillingTier): number {
  const rank = TIER_RANK[tierFromAPI(tier)]
  return Object.values(styles).filter((style) => style.tier !== "Free" && TIER_RANK[style.tier] <= rank).length
}

function CosmeticsVisual() {
  return (
    <div className="space-y-2">
      <style>{COSMETIC_CSS}</style>
      <VisualRow label="Friendly" color="#a1a1aa" note={<span className="text-muted-foreground">Default</span>}>
        <MiniRow character={{ name: "Thrall", class: "Shaman" }} cosmetic={PLAIN_COSMETIC} />
      </VisualRow>
      {PAID_BILLING_TIERS.map((tier) => {
        const slot = COSMETIC_SLOT[tier]
        return (
          <VisualRow
            key={tier}
            label={billingTierLabel(tier)}
            color={TIER_COLOR[tier]}
            note={
              <>
                <span style={{ color: TIER_COLOR[tier] }}>{slot.label}</span>
                <span className="text-muted-foreground"> · {slotStyleCount(slot.styles, tier)}</span>
              </>
            }
          >
            <MiniRow character={COSMETIC_SHOWCASE[tier].character} cosmetic={combineCosmetics(COSMETIC_SHOWCASE[tier].selection)} />
          </VisualRow>
        )
      })}
      <a
        href={COSMETIC_PLAYGROUND_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 pt-2 text-xs font-medium text-[#f0c060] underline-offset-4 hover:underline"
      >
        See every style in the cosmetic playground
        <ExternalLink className="size-3" aria-hidden="true" />
      </a>
    </div>
  )
}

function VisualRow({ label, color, note, children }: { label: string; color: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className={cn("grid items-center gap-3", note ? "grid-cols-[4.5rem_minmax(0,1fr)_7.5rem]" : "grid-cols-[5rem_minmax(0,1fr)]")}>
      <span className="font-wow text-xs font-bold" style={{ color }}>
        {label}
      </span>
      {children}
      {note ? <span className="text-xs">{note}</span> : null}
    </div>
  )
}

/** Wireframe page with or without an ad slot. */
const AD_RAIL =
  "flex w-[30%] shrink-0 items-center justify-center rounded border border-dashed border-rose-400/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(244,63,94,0.08)_6px,rgba(244,63,94,0.08)_12px)] text-[9px] uppercase tracking-[0.2em] text-rose-300/70 [writing-mode:vertical-rl]"

/** Wireframe raid page. Ads only ever sit in a side rail; without one the content takes the full width. */
function AdMockPage({ withAd, label }: { withAd: boolean; label: ReactNode }) {
  return (
    <div className="flex-1 space-y-2">
      <div className="text-center text-xs">{label}</div>
      <div className="flex gap-1.5 rounded-md border border-border bg-background/60 p-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-2 w-2/3 rounded bg-muted-foreground/30" />
          {["mage", "warrior", "priest", "rogue", "paladin"].map((cls, i) => (
            <div key={cls} className="h-2.5 rounded" style={{ width: `${96 - i * 12}%`, backgroundColor: `color-mix(in srgb, var(--color-class-${cls}) 55%, transparent)` }} />
          ))}
        </div>
        {withAd ? <div className={AD_RAIL}>Ad</div> : null}
      </div>
    </div>
  )
}

function AdFreeVisual() {
  return (
    <div className="flex gap-4">
      <AdMockPage withAd label={<span className="font-wow font-bold text-zinc-400">Friendly</span>} />
      <AdMockPage
        withAd={false}
        label={
          <span className="inline-flex items-center gap-1 rounded-full border border-lime-500/30 bg-lime-500/10 px-2 py-0.5 font-medium text-lime-300">
            <Sparkles className="h-3 w-3" aria-hidden="true" /> No ads, wider charts
          </span>
        }
      />
    </div>
  )
}

/** Wireframe of one of your pages, badged ad-free. */
function OwnedPage({ title, bars }: { title: string; bars: string[] }) {
  return (
    <div className="flex-1 space-y-1.5 rounded-md border border-border bg-background/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium text-zinc-200">{title}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-lime-500/30 bg-lime-500/10 px-1.5 py-px text-[10px] font-medium text-lime-300">
          <Sparkles className="h-2.5 w-2.5" aria-hidden="true" /> Ad-free
        </span>
      </div>
      {bars.map((cls, i) => (
        <div key={i} className="h-2.5 rounded" style={{ width: `${92 - i * 14}%`, backgroundColor: `color-mix(in srgb, var(--color-class-${cls}) 55%, transparent)` }} />
      ))}
    </div>
  )
}

const VIEWER_CLASSES = ["warrior", "priest", "mage", "rogue", "druid", "hunter", "paladin"]

function ViewersAdFreeVisual() {
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <OwnedPage title="Your raid logs" bars={["mage", "warrior", "priest", "rogue"]} />
        <OwnedPage title="Your characters" bars={["paladin", "paladin", "hunter", "druid"]} />
      </div>
      <div className="flex items-center gap-3 rounded-md border border-lime-500/30 bg-lime-500/10 px-3 py-2">
        <div className="flex shrink-0 -space-x-1.5">
          {VIEWER_CLASSES.map((cls) => (
            <span key={cls} className="size-5 rounded-full ring-2 ring-[#1b1f17]" style={{ backgroundColor: `var(--color-class-${cls})` }} />
          ))}
        </div>
        <p className="text-xs leading-snug text-lime-100">
          <span className="font-semibold text-lime-300">Shared with your viewers.</span> Every raider who opens them sees no ads.
        </p>
      </div>
    </div>
  )
}

const STORAGE_BAR_WIDTH: Record<PaidBillingTier, number> = { honored: 18, revered: 55, exalted: 100 }

function StorageVisual() {
  return (
    <div className="space-y-3">
      <VisualRow label="Friendly" color="#a1a1aa">
        <span className="text-xs text-muted-foreground">Standard allowance</span>
      </VisualRow>
      {PAID_BILLING_TIERS.map((tier) => (
        <VisualRow key={tier} label={billingTierLabel(tier)} color={TIER_COLOR[tier]}>
          <div className="flex items-center gap-2">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted-foreground/20">
              <div className="h-full rounded-full" style={{ width: `${STORAGE_BAR_WIDTH[tier]}%`, backgroundColor: TIER_COLOR[tier] }} />
            </div>
            <span className="w-14 text-right font-mono text-xs text-zinc-200">+{billingTierStorageLabel(tier)}</span>
          </div>
        </VisualRow>
      ))}
    </div>
  )
}

const MOCK_FILES = [
  { name: "WoWCombatLog-102426_201544.txt", size: "184 MB" },
  { name: "WoWCombatLog-101726_201201.txt", size: "212 MB" },
  { name: "WoWCombatLog-101026_200930.txt", size: "167 MB" },
]

function DownloadsVisual() {
  const color = TIER_COLOR.revered
  return (
    <div className="space-y-2">
      {MOCK_FILES.map((file) => (
        <div key={file.name} className="flex items-center gap-3 rounded-md border border-border bg-background/60 p-2.5">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-200">{file.name}</span>
          <span className="text-xs text-muted-foreground">{file.size}</span>
          <span className="rounded-md border p-1.5" style={{ borderColor: `${color}80`, color }}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
      ))}
    </div>
  )
}

function UnlistedVisual() {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-background/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-white">Naxxramas</span>
          <UnlistedBadge />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Uploaded by you · 14 bosses</p>
      </div>
      <ul className="space-y-1.5 text-xs text-zinc-300">
        <li className="flex items-center gap-2">
          <LockKeyhole className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          Hidden from rankings, leaderboards, search, and discovery
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          Anyone you share the link with can still view it
        </li>
      </ul>
    </div>
  )
}


// Rounded down from the panel picker (PANEL_CATEGORIES in EventsPanels/PanelSelector.tsx, 57 today)
// so it stays true as panels are added without importing the panel registry here.
const PANEL_TYPE_COUNT = "50+"

const FREE_FEATURES = [
  { icon: MapIcon, label: "3D map replays" },
  { icon: Activity, label: "Player timelines" },
  { icon: Trophy, label: "Rankings & leaderboards" },
  { icon: Timer, label: "Speedrun boards" },
  { icon: Shield, label: "Guild pages" },
  { icon: Users, label: "Raid planner" },
  { icon: Sparkles, label: "Talent & gear builders" },
]

const FREE_TILE = "flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs"

function FreeVisual() {
  return (
    <ul className="grid grid-cols-2 gap-2">
      <li className={cn(FREE_TILE, "col-span-2 border-zinc-400/40 bg-zinc-400/10 py-2.5")}>
        <Swords className="size-5 shrink-0 text-zinc-200" aria-hidden="true" />
        <span>
          <span className="font-wow text-base font-bold text-white">{PANEL_TYPE_COUNT} panel types</span>
          <span className="block text-muted-foreground">Damage, healing, deaths, buffs, dispels, cooldowns, and more</span>
        </span>
      </li>
      {FREE_FEATURES.map(({ icon: Icon, label }) => (
        <li key={label} className={cn(FREE_TILE, "border-border bg-background/60 text-zinc-200")}>
          <Icon className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
          {label}
        </li>
      ))}
      <li className={cn(FREE_TILE, "justify-center border-dashed border-muted-foreground/40 text-muted-foreground")}>
        <Plus className="size-4 shrink-0" aria-hidden="true" />
        more
      </li>
    </ul>
  )
}

const SLIDES: PerkSlide[] = [
  {
    id: "free",
    tab: "Free",
    tier: "free",
    headline: "Every raid tool, free.",
    body: "Upload logs and get the full analysis: replays, timelines, panels, and rankings. Core analysis is never paywalled. Supporter perks are extras on top.",
    visual: <FreeVisual />,
  },
  {
    id: "cosmetics",
    tab: "Cosmetics",
    tier: "honored",
    headline: "Stand out in every raid chart.",
    body: "Animated name, background, and border styles follow your characters across damage, healing, and every other player row on Chronicle.",
    levels: [
      { tier: "free", text: "Plain class-colored rows" },
      { tier: "honored", text: "Animated name styles" },
      { tier: "revered", text: "+ Animated backgrounds" },
      { tier: "exalted", text: "+ Animated borders" },
    ],
    visual: <CosmeticsVisual />,
  },
  {
    id: "ad-free",
    tab: "Ad-Free",
    tier: "honored",
    headline: "You see no ads. Anywhere.",
    body: "Every page on Chronicle is ad-free for you: raid reports, rankings, armory, and everything else. The ad rail disappears, so your charts and panels get the extra width.",
    levels: [
      { tier: "free", text: "An ad rail beside some pages" },
      { tier: "honored", text: "No ads, and the rail's space goes to your content" },
    ],
    visual: <AdFreeVisual />,
  },
  {
    id: "storage",
    tab: "Storage",
    tier: "honored",
    headline: "Keep a whole season of wipes.",
    body: "Extra raw log storage on top of the standard allowance, so you can keep the files behind your reports instead of pruning them.",
    levels: [
      { tier: "free", text: "Standard allowance" },
      { tier: "honored", text: "+300 MB" },
      { tier: "revered", text: "+1 GB" },
      { tier: "exalted", text: "+2 GB" },
    ],
    visual: <StorageVisual />,
  },
  {
    id: "viewers-ad-free",
    tab: "Shared Ad-Free",
    tier: "revered",
    headline: "Your whole raid sees no ads.",
    body: "Every instance page from a log you upload, and the armory page of every character you've linked, is ad-free for everyone who opens it. Share a report and your raid gets it clean.",
    levels: [
      { tier: "free", text: "Viewers of your logs may see ads" },
      { tier: "revered", text: "No ads for anyone viewing your logs or characters" },
    ],
    visual: <ViewersAdFreeVisual />,
  },
  {
    id: "downloads",
    tab: "Raw Downloads",
    tier: "revered",
    headline: "Your combat logs, archived.",
    body: "Download the original combat log file behind any of your uploads. Use Chronicle as the archive for your raw data.",
    levels: [
      { tier: "free", text: "Parsed reports only" },
      { tier: "revered", text: "Download every original file you've uploaded" },
    ],
    visual: <DownloadsVisual />,
  },
  {
    id: "unlisted",
    tab: "Unlisted Logs",
    tier: "revered",
    headline: "Progression stays in progression.",
    body: "Mark uploads unlisted so only people with the link can find them. Unlisting is permanent and removes the log from rankings.",
    levels: [
      { tier: "free", text: "Uploads are publicly listed" },
      { tier: "revered", text: "Unlist any log you upload" },
    ],
    visual: <UnlistedVisual />,
  },
]

/** Without a hash, open on the first paid perk; the Friendly tab is there for context. */
const DEFAULT_SLIDE = SLIDES.findIndex((slide) => slide.tier === "honored")

function slideIndexFromHash(hash: string): number {
  const index = SLIDES.findIndex((slide) => `#${slide.id}` === hash)
  return index >= 0 ? index : DEFAULT_SLIDE
}

/** Tabbed panel of supporter perks. The URL hash selects the tab so locked hints can deep-link. */
export function PerkShowcase() {
  const location = useLocation()
  const navigate = useNavigate()
  const sectionRef = useRef<HTMLElement>(null)
  const index = slideIndexFromHash(location.hash)
  const slide = SLIDES[index]
  const tierColor = slideColor(slide.tier)

  // Bring deep-linked perks into view on arrival.
  useEffect(() => {
    if (SLIDES.some((s) => `#${s.id}` === location.hash)) {
      sectionRef.current?.scrollIntoView({ block: "start" })
    }
    // Only on mount: tab clicks also change the hash and shouldn't scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section ref={sectionRef} aria-label="Supporter perks" className="scroll-mt-4">
      <div className={cn(PANEL, "overflow-hidden")}>
        <div role="tablist" aria-label="Perks" className="flex flex-wrap border-b border-border bg-black/20">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => navigate({ hash: s.id }, { replace: true, preventScrollReset: true })}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors",
                i === index ? "text-white" : "text-muted-foreground hover:text-foreground",
              )}
              // Unselected tabs keep a faint tier-colored underline so the tier reads at a glance.
              style={{ borderColor: i === index ? slideColor(s.tier) : `${slideColor(s.tier)}40` }}
            >
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: slideColor(s.tier) }} />
              {s.tab}
            </button>
          ))}
        </div>

        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: `radial-gradient(ellipse at 85% 40%, ${tierColor}22, transparent 60%)` }}
          />
          <div role="tabpanel" className="relative grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {slide.tier === "free" ? (
                  <span className="inline-flex items-center rounded-full border border-zinc-400/40 bg-zinc-400/10 px-1.5 py-px font-wow text-[10px] font-bold uppercase tracking-wider text-zinc-200">
                    Friendly
                  </span>
                ) : (
                  <TierPill tier={slide.tier} />
                )}
                {slide.tier === "free" ? <span>no account tier needed</span> : <span>and above</span>}
              </div>
              <h3 className="font-wow text-2xl leading-tight text-white sm:text-3xl">{slide.headline}</h3>
              <p className="text-sm leading-relaxed text-zinc-300 sm:text-base">{slide.body}</p>
              {slide.levels ? (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                  {slide.levels.map((level) => (
                    <div key={level.tier} className="contents">
                      <dt className="font-wow" style={{ color: level.tier === "free" ? "#71717a" : slideColor(level.tier) }}>
                        {level.tier === "free" ? "Friendly" : billingTierLabel(level.tier)}
                      </dt>
                      <dd className={level.tier === "free" ? "text-muted-foreground" : "text-zinc-200"}>{level.text}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-4 sm:p-5">{slide.visual}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
