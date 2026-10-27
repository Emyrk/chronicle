import { useEffect, useRef } from "react"
import type { ReactNode } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowRight, Check, ChevronLeft, ChevronRight, Download, FileText, LockKeyhole, Sparkles } from "lucide-react"
import { COSMETIC_CSS, combineCosmetics } from "@/components/ui/PlayerMetricChart/PlayerCosmetics"
import { MiniRow } from "@/features/characterCosmetics/CharacterCosmeticsEditor"
import { TierPill } from "@/components/Supporter/Supporter"
import { SUPPORTER_GOLD, type SupporterPerk } from "@/components/Supporter/supporterUpsell"
import { cn } from "@/lib/utils"
import { UnlistedBadge } from "@/pages/Logs/components/UnlistedBadge"
import { COSMETIC_SHOWCASE, PAID_BILLING_TIERS, TIER_COLOR, billingTierLabel, billingTierStorageLabel, type PaidBillingTier } from "@/pages/Settings/billingPricing"

const PANEL = "rounded-lg border border-border bg-card shadow-2xl shadow-black/40 ring-1 ring-white/10"

interface PerkSlide {
  id: SupporterPerk
  tab: string
  tier: PaidBillingTier
  headline: string
  body: string
  friendly: string
  supporter: string
  visual: ReactNode
}

const PLAIN_COSMETIC = combineCosmetics({ name: "none", background: "none", border: "none" })

function CosmeticsVisual() {
  return (
    <div className="space-y-2">
      <style>{COSMETIC_CSS}</style>
      <VisualRow label="Friendly" color="#a1a1aa">
        <MiniRow character={{ name: "Thrall", class: "Shaman" }} cosmetic={PLAIN_COSMETIC} />
      </VisualRow>
      {PAID_BILLING_TIERS.map((tier) => (
        <VisualRow key={tier} label={billingTierLabel(tier)} color={TIER_COLOR[tier]}>
          <MiniRow character={COSMETIC_SHOWCASE[tier].character} cosmetic={combineCosmetics(COSMETIC_SHOWCASE[tier].selection)} />
        </VisualRow>
      ))}
    </div>
  )
}

function VisualRow({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
      <span className="font-wow text-xs font-bold" style={{ color }}>
        {label}
      </span>
      {children}
    </div>
  )
}

/** Wireframe page with or without an ad slot. */
function MockPage({ withAd, label }: { withAd: boolean; label: ReactNode }) {
  return (
    <div className="flex-1 space-y-2">
      <div className="text-center text-xs">{label}</div>
      <div className="space-y-1.5 rounded-md border border-border bg-background/60 p-2">
        <div className="h-2 w-2/3 rounded bg-muted-foreground/30" />
        {withAd ? (
          <div className="flex h-12 items-center justify-center rounded border border-dashed border-rose-400/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(244,63,94,0.08)_6px,rgba(244,63,94,0.08)_12px)] text-[9px] uppercase tracking-[0.2em] text-rose-300/70">
            Advertisement
          </div>
        ) : null}
        {[90, 72, 84, 60].map((w) => (
          <div key={w} className="h-3 rounded bg-[var(--color-class-mage)]/50" style={{ width: `${w}%` }} />
        ))}
        {withAd ? null : <div className="h-3 w-1/2 rounded bg-[var(--color-class-paladin)]/50" />}
      </div>
    </div>
  )
}

function AdFreeVisual() {
  return (
    <div className="flex gap-4">
      <MockPage withAd label={<span className="font-wow font-bold text-zinc-400">Friendly</span>} />
      <MockPage
        withAd={false}
        label={
          <span className="inline-flex items-center gap-1 rounded-full border border-lime-500/30 bg-lime-500/10 px-2 py-0.5 font-medium text-lime-300">
            <Sparkles className="h-3 w-3" /> Ad-free
          </span>
        }
      />
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

function FutureVisual() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {["#0070dd", "#a335ee", "#ff8000"].map((color) => (
        <div
          key={color}
          className="flex aspect-square items-center justify-center rounded-md border-2 bg-black/40 font-wow text-3xl font-bold"
          style={{ borderColor: `${color}99`, color }}
        >
          ?
        </div>
      ))}
    </div>
  )
}

const SLIDES: PerkSlide[] = [
  {
    id: "cosmetics",
    tab: "Cosmetics",
    tier: "honored",
    headline: "Stand out in every raid chart.",
    body: "Animated name, background, and border styles follow your characters across damage, healing, and every other player row on Chronicle.",
    friendly: "Plain class-colored rows",
    supporter: "Name styles at Honored, backgrounds at Revered, borders at Exalted",
    visual: <CosmeticsVisual />,
  },
  {
    id: "ad-free",
    tab: "Ad-Free",
    tier: "honored",
    headline: "Clear line of sight to every pull.",
    body: "Remove every advertisement from Chronicle. Your own logs and characters go ad-free for everyone who views them, so your raid sees a clean report too.",
    friendly: "Limited ads on some pages",
    supporter: "No ads for you, and none on your logs for your raid",
    visual: <AdFreeVisual />,
  },
  {
    id: "storage",
    tab: "Storage",
    tier: "honored",
    headline: "Keep a whole season of wipes.",
    body: "Extra raw log storage on top of the standard allowance, so you can keep the files behind your reports instead of pruning them.",
    friendly: "Standard storage allowance",
    supporter: "+300 MB at Honored, +1 GB at Revered, +2 GB at Exalted",
    visual: <StorageVisual />,
  },
  {
    id: "downloads",
    tab: "Raw Downloads",
    tier: "revered",
    headline: "Your combat logs, archived.",
    body: "Download the original combat log file behind any of your uploads. Use Chronicle as the archive for your raw data.",
    friendly: "Parsed reports only",
    supporter: "Download every original file you've uploaded",
    visual: <DownloadsVisual />,
  },
  {
    id: "unlisted",
    tab: "Unlisted Logs",
    tier: "revered",
    headline: "Progression stays in progression.",
    body: "Mark uploads unlisted so only people with the link can find them. Unlisting is permanent and removes the log from rankings.",
    friendly: "Uploads are publicly listed",
    supporter: "Unlist any log you upload",
    visual: <UnlistedVisual />,
  },
  {
    id: "future",
    tab: "Coming Soon",
    tier: "revered",
    headline: "Every future perk, included.",
    body: "New supporter perks are on the way. Revered and Exalted supporters get them automatically as they ship.",
    friendly: "Core analysis, always free",
    supporter: "New perks unlock as they release",
    visual: <FutureVisual />,
  },
]

function slideIndexFromHash(hash: string): number {
  const index = SLIDES.findIndex((slide) => `#${slide.id}` === hash)
  return Math.max(0, index)
}

/** Tabbed carousel of supporter perks. The URL hash selects the slide so locked hints can deep-link. */
export function PerkShowcase({ ctaTo }: { ctaTo: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const sectionRef = useRef<HTMLElement>(null)
  const index = slideIndexFromHash(location.hash)
  const slide = SLIDES[index]
  const tierColor = TIER_COLOR[slide.tier]

  // Bring deep-linked perks into view on arrival.
  useEffect(() => {
    if (SLIDES.some((s) => `#${s.id}` === location.hash)) {
      sectionRef.current?.scrollIntoView({ block: "start" })
    }
    // Only on mount: tab clicks also change the hash and shouldn't scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const select = (next: number) => {
    const wrapped = (next + SLIDES.length) % SLIDES.length
    navigate({ hash: SLIDES[wrapped].id }, { replace: true, preventScrollReset: true })
  }

  return (
    <section ref={sectionRef} aria-label="Supporter perks" className="scroll-mt-4 space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-wow text-2xl" style={{ color: SUPPORTER_GOLD }}>
            Supporter Perks
          </h2>
          <p className="text-sm text-muted-foreground">Everything your reputation unlocks. Core analysis stays free for everyone.</p>
        </div>
        <a href="#compare" className="hidden shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
          Compare tiers <ChevronRight className="h-4 w-4" />
        </a>
      </div>

      <div className={cn(PANEL, "relative overflow-hidden")}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: `radial-gradient(ellipse at 85% 30%, ${tierColor}26, transparent 60%)` }}
        />
        <div className="relative grid items-center gap-8 p-6 sm:p-8 lg:px-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TierPill tier={slide.tier} />
              {slide.id === "future" ? null : <span>and above</span>}
            </div>
            <h3 className="font-wow text-2xl leading-tight text-white sm:text-3xl">{slide.headline}</h3>
            <p className="text-sm leading-relaxed text-zinc-300 sm:text-base">{slide.body}</p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-start gap-2 text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                <span>
                  <span className="font-wow text-zinc-400">Friendly</span> – {slide.friendly}
                </span>
              </li>
              <li className="flex items-start gap-2 text-zinc-200">
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tierColor }} aria-hidden="true" />
                <span>
                  <span className="font-wow" style={{ color: tierColor }}>
                    {billingTierLabel(slide.tier)}
                  </span>{" "}
                  – {slide.supporter}
                </span>
              </li>
            </ul>
            <Link
              to={ctaTo}
              className="inline-flex items-center gap-2 rounded-md border-2 px-4 py-2 font-wow text-sm font-bold transition-colors hover:bg-white/5"
              style={{ borderColor: `${tierColor}b3`, color: tierColor, backgroundColor: `${tierColor}1a` }}
            >
              Become {billingTierLabel(slide.tier)} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-4 sm:p-5">{slide.visual}</div>
        </div>

        <button
          type="button"
          onClick={() => select(index - 1)}
          aria-label="Previous perk"
          className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-background/80 p-1.5 text-muted-foreground hover:text-foreground lg:block"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => select(index + 1)}
          aria-label="Next perk"
          className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-background/80 p-1.5 text-muted-foreground hover:text-foreground lg:block"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div role="tablist" aria-label="Perks" className="styled-scrollbar flex gap-1 overflow-x-auto pb-1">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => select(i)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors",
              i === index ? "border-[#c9a227]/60 bg-[#f0c060]/10 text-[#f0c060]" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.tab}
          </button>
        ))}
      </div>
    </section>
  )
}
