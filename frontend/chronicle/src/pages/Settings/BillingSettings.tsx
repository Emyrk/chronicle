import { useState } from "react"
import { Link, Navigate } from "react-router-dom"
import type { BillingPrice, BillingSummary } from "@/api/typesGenerated"
import { useCreateBillingCancel, useCreateBillingCheckout, useCreateBillingPortal, useBillingSummary, useSiteConfig } from "@/api/queries"
import { iconUrl } from "@/config/iconUrl"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import { LogIn } from "lucide-react"
import { toast } from "sonner"
import {
  PAID_BILLING_TIERS,
  type BillingQuality,
  type PaidBillingTier,
  bestValuePriceID,
  billingDiscountPercent,
  billingPeriodDescription,
  billingPeriodLabel,
  billingPriceQualities,
  billingTierLabel,
  formatBillingAmount,
  formatMonthlyAmount,
} from "./billingPricing"
import { billingSubscriptionState } from "./billingSubscriptionState"

// Styling mirrors the landing site's /support page: gold Friz Quadrata headings,
// brown framed panels, and WoW item tooltips.
const GOLD = "#f0c060"
const FRAME = "rounded-lg border border-border bg-card shadow-2xl shadow-black/40 ring-1 ring-white/10"
const TOOLTIP = "rounded-lg border-2 border-[#4a4a6a] bg-[#1a1a2e] shadow-lg"

// WoW reputation standings, in order. Free users sit at Friendly; paid tiers reach their configured standing.
const STANDINGS = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"] as const

const TIER_COLOR: Record<PaidBillingTier, string> = {
  honored: "#0070dd",
  revered: "#a335ee",
  exalted: "#ff8000",
}

const TIER_ICON: Record<PaidBillingTier, string> = {
  honored: "inv_misc_token_argentdawn",
  revered: "inv_jewelry_talisman_07",
  exalted: "inv_crown_02",
}

const QUALITY_COLOR: Record<BillingQuality, string> = {
  uncommon: "#1eff00",
  rare: "#0070dd",
  epic: "#a335ee",
  legendary: "#ff8000",
}

const QUALITY_ICON: Record<BillingQuality, string> = {
  uncommon: "inv_misc_coin_01",
  rare: "inv_misc_token_argentdawn",
  epic: "inv_jewelry_talisman_07",
  legendary: "inv_crown_02",
}

const REWARDS = [
  {
    title: "Ad-Free Browsing",
    icon: "inv_misc_eye_01",
    effects: ["Equip: Removes all advertisements from Chronicle."],
    flavor: "Clear line of sight to every pull.",
  },
  {
    title: "Expanded Log Storage",
    icon: "inv_misc_bag_10",
    effects: ["Equip: Increases your log storage by 300 MB."],
    flavor: "Holds a whole season of wipes.",
  },
  {
    title: "Raw Log Downloads",
    icon: "inv_scroll_03",
    effects: ["Use: Download the original combat log file behind any of your uploads."],
    flavor: "Every swing, every wipe, unabridged.",
  },
  {
    title: "Unlisted Logs",
    icon: "ability_stealth",
    effects: ["Equip: Keeps your uploads out of public view."],
    flavor: "What happens in progression stays in progression.",
  },
]

export function BillingSettings() {
  const { data: siteConfig, isLoading: isSiteConfigLoading } = useSiteConfig()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const { data: billing, isLoading } = useBillingSummary()

  if (isSiteConfigLoading || isAuthLoading) return null
  if (!siteConfig?.billing_enabled) return <Navigate to="/account/settings" replace />

  if (!isAuthenticated) return <BillingSignInPrompt />

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading billing status…</p>
  }

  if (!billing?.enabled) {
    return (
      <section className="max-w-2xl space-y-2">
        <h2 className="text-2xl font-semibold">Billing</h2>
        <p className="text-muted-foreground">Paid subscriptions are not available yet.</p>
      </section>
    )
  }

  if (billing.has_subscription) {
    return <TierSubscriptionSettings billing={billing} />
  }

  return <SupporterOverview billing={billing} panel={billing.has_billing_account ? <FormerSubscriberPanel billing={billing} /> : <PlanPicker prices={billing.prices ?? []} />} />
}

export function BillingSignInPrompt() {
  return (
    <section className="max-w-2xl space-y-5">
      <div>
        <h2 className="font-wow text-3xl text-[#f0c060]">Support Chronicle</h2>
        <p className="mt-2 text-muted-foreground">Sign in to view Honored, Revered, and Exalted plans, start a subscription, or open your Stripe billing history.</p>
      </div>
      <div className={cn(FRAME, "flex flex-col items-center gap-4 p-6 text-center")}>
        <div>
          <h3 className="font-wow text-xl text-white">Sign in to continue</h3>
          <p className="mt-1 text-sm text-muted-foreground">Billing and subscription history are connected to your Chronicle account.</p>
        </div>
        <Link to="/login?from=/account/billing">
          <Button className="gap-2">
            <LogIn className="h-4 w-4" />
            Sign in
          </Button>
        </Link>
      </div>
    </section>
  )
}

/** Shared supporter-tier overview used by account billing and the public /revered route. */
export function SupporterOverview({ billing, panel }: { billing?: BillingSummary; panel: React.ReactNode }) {
  const hasTierAccess = billing?.ads_free ?? false
  const tierLabel = billingTierLabel(billing?.tier ?? "free")

  return (
    <section className="max-w-5xl space-y-8">
      <div className="space-y-3">
        <h2 className="font-wow text-3xl leading-tight sm:text-4xl">
          <span style={{ color: GOLD }}>{hasTierAccess ? `You are ${tierLabel}` : "Support Chronicle"}</span> <span className="text-white">and earn reputation</span>
        </h2>
        <p className="max-w-3xl text-muted-foreground">
          Choose an Honored, Revered, or Exalted supporter tier. Every tier currently grants the same complete reward set while helping cover hosting and development. Everything
          else on Chronicle stays free for everyone.
        </p>
      </div>

      <Achievement billing={billing} />

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {panel}

        <div>
          <h3 className="font-wow text-xl font-semibold">Supporter Rewards</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {REWARDS.map((reward) => (
              <RewardTooltip key={reward.title} reward={reward} unlocked={hasTierAccess} tierLabel={tierLabel} />
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        For any billing issues, contact{" "}
        <a className="text-[#f0c060] underline decoration-[#f0c060]/40 underline-offset-4 hover:text-[#ffd580]" href="mailto:support@chronicleclassic.com">
          support@chronicleclassic.com
        </a>
        .
      </p>

      <ComparisonTable subscribed={hasTierAccess} />
    </section>
  )
}

const COMPARISON = [
  {
    feature: "Log parsing, panels, rankings, and replays",
    friendly: "Full access. Core analysis is never paywalled.",
    supporter: "Full access, same as everyone.",
  },
  {
    feature: "Advertisements",
    friendly: "Limited ads appear on some pages to help cover hosting costs.",
    supporter: "No ads anywhere on Chronicle.",
  },
  {
    feature: "Log storage",
    friendly: "The standard storage allowance for your uploads.",
    supporter: "An extra 300 MB on top of the standard allowance.",
  },
  {
    feature: "Raw log downloads",
    friendly: "—",
    supporter: "Download the original combat log file behind any of your uploads. Use Chronicle as an archive for your raw data.",
  },
  {
    feature: "Unlisted logs",
    friendly: "Uploads are publicly viewable.",
    supporter: "Keep uploads unlisted so only people with the link can find them.",
  },
  {
    feature: "Supporting Chronicle",
    friendly: "—",
    supporter: "Your subscription directly funds hosting and ongoing development.",
  },
]

/** Plain-language breakdown of what supporter tiers change compared to free access. */
function ComparisonTable({ subscribed }: { subscribed: boolean }) {
  return (
    <div className={FRAME}>
      <h3 className="rounded-t-lg border-b border-border bg-[oklch(0.36_0_0)] px-4 py-2 text-center font-wow text-base font-bold tracking-[0.08em]" style={{ color: GOLD }}>
        Friendly vs Supporter Tiers
      </h3>
      <div className="overflow-hidden rounded-b-lg">
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-4 border-b border-border px-5 py-2.5 font-wow text-sm sm:grid">
          <span className="text-muted-foreground">Feature</span>
          <span className={cn(subscribed ? "text-muted-foreground" : "text-[#00c000]")}>
            Friendly <span className="font-sans text-xs text-muted-foreground">(free)</span>
          </span>
          <span style={{ color: GOLD }}>Honored, Revered, or Exalted</span>
        </div>
        <dl className="divide-y divide-white/5">
          {COMPARISON.map(({ feature, friendly, supporter }) => (
            <div key={feature} className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] sm:gap-4">
              <dt className="font-medium text-white">{feature}</dt>
              <dd className="text-muted-foreground">
                <span className="mr-1 font-wow text-xs text-[#00c000] sm:hidden">Friendly:</span>
                {friendly}
              </dd>
              <dd className="text-zinc-200">
                <span className="mr-1 font-wow text-xs sm:hidden" style={{ color: GOLD }}>
                  Supporter:
                </span>
                {supporter}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function useOpenBilling() {
  return async (action: () => Promise<string>, newTab = false) => {
    const openedTab = newTab ? window.open("about:blank", "_blank") : null
    if (newTab && !openedTab) {
      toast.error("Allow pop-ups to open the Stripe Billing Portal.")
      return
    }
    if (openedTab) openedTab.opener = null

    try {
      const url = await action()
      if (openedTab) {
        openedTab.location.assign(url)
      } else {
        window.location.assign(url)
      }
    } catch (error) {
      openedTab?.close()
      toast.error(error instanceof Error ? error.message : "Unable to open billing")
    }
  }
}

/** WoW achievement row: greyed out with a reputation progress bar until earned. */
function Achievement({ billing }: { billing?: BillingSummary }) {
  const hasTierAccess = billing?.ads_free ?? false
  const subscriptionState = billing ? billingSubscriptionState(billing) : null
  const billingDate = subscriptionState?.effectiveDate
  const standing = hasTierAccess ? billingTierLabel(billing?.tier ?? "honored") : "Friendly"
  const standingIndex = Math.max(0, STANDINGS.indexOf(standing as (typeof STANDINGS)[number]))
  const fill = ((standingIndex + (hasTierAccess ? 1 : 0.15)) / STANDINGS.length) * 100

  return (
    <div className={cn(FRAME, "p-4 sm:p-5")}>
      <div className="flex items-center gap-4">
        <img
          src={iconUrl("inv_crown_01")}
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
          className={cn("size-14 shrink-0 rounded border-2 sm:size-16", hasTierAccess ? "border-[#c9a227]" : "border-zinc-600 opacity-60 grayscale")}
        />
        <div className="min-w-0 flex-1 text-center">
          <p className="font-wow text-xl font-bold sm:text-2xl" style={{ color: hasTierAccess ? GOLD : "#a1a1aa" }}>
            {hasTierAccess ? standing : "Chronicle Reputation"}
          </p>
          <p className="mt-0.5 text-sm text-zinc-300">Choose Honored, Revered, or Exalted to support Chronicle.</p>
        </div>
        <div className="flex w-16 shrink-0 flex-col items-center gap-1">
          <PointsShield earned={hasTierAccess} />
          {hasTierAccess && billingDate ? (
            <span className="text-[10px] text-zinc-400">
              {subscriptionState?.cancellationScheduled || subscriptionState?.subscriptionEnded ? "Ends" : "Renews"}{" "}
              {new Date(billingDate).toLocaleDateString(undefined, {
                month: "numeric",
                day: "numeric",
                year: "2-digit",
              })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-2xl">
        <div
          role="meter"
          aria-label="Reputation with Chronicle"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fill)}
          aria-valuetext={standing}
          className="relative h-5 overflow-hidden rounded-sm border border-black bg-black/60"
        >
          <div className={cn("h-full", hasTierAccess ? "bg-[#00aa88]" : "bg-[#00a000]")} style={{ width: `${fill}%` }} />
          <span className="absolute inset-0 flex items-center justify-center font-wow text-xs text-white [text-shadow:1px_1px_1px_#000]">Chronicle – {standing}</span>
        </div>
      </div>

      <p className="mt-4 border-t border-border pt-3 text-center font-wow text-sm" style={{ color: "#ffd200" }}>
        Reward: Ad-free browsing, +300 MB storage, raw log downloads, and unlisted logs
      </p>
    </div>
  )
}

function PointsShield({ earned }: { earned: boolean }) {
  return (
    <svg viewBox="0 0 40 46" className="h-12 w-11" aria-label="10 points">
      <path d="M20 2 L37 8 V22 C37 33 29 40 20 44 C11 40 3 33 3 22 V8 Z" fill={earned ? "#8a6a1a" : "#3f3f46"} stroke={earned ? "#e8c45a" : "#71717a"} strokeWidth="2.5" />
      <text x="20" y="28" textAnchor="middle" fontSize="15" fontWeight="bold" fill={earned ? "#fff" : "#a1a1aa"} style={{ textShadow: "1px 1px 1px #000" }}>
        10
      </text>
    </svg>
  )
}

/** Reward styled like the /support page's item tooltips. Red requirement lines mean "not yet earned". */
function RewardTooltip({ reward, unlocked, tierLabel }: { reward: (typeof REWARDS)[number]; unlocked: boolean; tierLabel: string }) {
  return (
    <article className={cn(TOOLTIP, "p-3 text-xs leading-snug")}>
      <div className="flex items-center gap-3">
        <img
          src={iconUrl(reward.icon)}
          alt=""
          aria-hidden="true"
          width={44}
          height={44}
          className={cn("shrink-0 rounded border-2 border-yellow-600/60", !unlocked && "opacity-80")}
        />
        <h4 className="text-sm font-medium leading-tight" style={{ color: QUALITY_COLOR.epic }}>
          {reward.title}
        </h4>
      </div>
      <div className="mt-2 space-y-0.5">
        <div className="text-white">Binds to your supporter tier</div>
        <div style={{ color: unlocked ? "#ffffff" : "#ff2020" }}>{unlocked ? `Requires Chronicle – ${tierLabel}` : "Requires an Honored, Revered, or Exalted subscription"}</div>
        {reward.effects.map((line) => (
          <div key={line} style={{ color: QUALITY_COLOR.uncommon }}>
            {line}
          </div>
        ))}
        <div className="pt-1 text-[#ffd200]">&ldquo;{reward.flavor}&rdquo;</div>
      </div>
    </article>
  )
}

export function FramePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cn(FRAME, "lg:sticky lg:top-4")}>
      <h3 className="rounded-t-lg border-b border-border bg-[oklch(0.36_0_0)] px-4 py-2 text-center font-wow text-base font-bold tracking-[0.08em]" style={{ color: GOLD }}>
        {title}
      </h3>
      <div className="space-y-3 rounded-b-lg p-4">{children}</div>
    </div>
  )
}

export const GOLD_BUTTON =
  "flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#c9a227]/70 bg-[#f0c060]/10 px-4 py-2.5 font-wow text-base font-bold text-[#f0c060] transition-colors hover:bg-[#f0c060]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50"

function FormerSubscriberPanel({ billing }: { billing: BillingSummary }) {
  const [view, setView] = useState<"plans" | "history">("plans")

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
        <button
          type="button"
          aria-pressed={view === "plans"}
          onClick={() => setView("plans")}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium transition-colors",
            view === "plans" ? "bg-[#f0c060]/15 text-[#f0c060]" : "text-muted-foreground hover:bg-white/5 hover:text-white",
          )}
        >
          Choose a plan
        </button>
        <button
          type="button"
          aria-pressed={view === "history"}
          onClick={() => setView("history")}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium transition-colors",
            view === "history" ? "bg-[#f0c060]/15 text-[#f0c060]" : "text-muted-foreground hover:bg-white/5 hover:text-white",
          )}
        >
          Subscription history
        </button>
      </div>
      {view === "plans" ? <PlanPicker prices={billing.prices ?? []} /> : <FormerSubscriptionHistory billing={billing} />}
    </div>
  )
}

function FormerSubscriptionHistory({ billing }: { billing: BillingSummary }) {
  const portal = useCreateBillingPortal()
  const openBilling = useOpenBilling()
  const subscriptionState = billingSubscriptionState(billing)
  const displayDate = subscriptionState.effectiveDate ? new Date(subscriptionState.effectiveDate).toLocaleDateString() : null

  return (
    <FramePanel title="Previous Subscription">
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-wow text-zinc-200">{billingTierLabel(billing.tier)}</dd>
        </div>
        {billing.status ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-white">{subscriptionState.statusLabel}</dd>
          </div>
        ) : null}
        {displayDate ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{subscriptionState.periodLabel}</dt>
            <dd className="text-white">{displayDate}</dd>
          </div>
        ) : null}
      </dl>
      <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        Stripe keeps the complete payment, invoice, refund, and subscription history for this billing account.
      </p>
      <button type="button" className={GOLD_BUTTON} disabled={portal.isPending} onClick={() => void openBilling(() => portal.mutateAsync(), true)}>
        {portal.isPending ? "Opening Stripe…" : "View Stripe Billing History"}
      </button>
    </FramePanel>
  )
}

function PlanPicker({ prices }: { prices: readonly BillingPrice[] }) {
  const checkout = useCreateBillingCheckout()
  const openBilling = useOpenBilling()
  const availableTiers = PAID_BILLING_TIERS.filter((tier) => prices.some((price) => price.tier === tier))
  const defaultTier = availableTiers.includes("revered") ? "revered" : availableTiers[0]
  const [selectedTier, setSelectedTier] = useState<PaidBillingTier | undefined>(defaultTier)
  const tier = selectedTier && availableTiers.includes(selectedTier) ? selectedTier : defaultTier
  const tierPrices = prices.filter((price) => price.tier === tier)
  const monthlyPrice = tierPrices.find((price) => price.interval_months === 1)
  const [selectedPriceID, setSelectedPriceID] = useState<string | null>(null)
  const selectedPrice = tierPrices.find((price) => price.id === selectedPriceID) ?? monthlyPrice ?? tierPrices[0]
  const bestPriceID = bestValuePriceID(tierPrices, monthlyPrice)
  const qualities = billingPriceQualities(tierPrices)
  const sorted = [...tierPrices].sort((a, b) => b.interval_months - a.interval_months)
  const tierLabel = tier ? billingTierLabel(tier) : "Supporter"

  const chooseTier = (nextTier: PaidBillingTier) => {
    setSelectedTier(nextTier)
    setSelectedPriceID(null)
  }

  return (
    <FramePanel title="Choose Your Standing">
      <p className="text-center text-xs text-muted-foreground">Every tier currently grants the same complete rewards. Choose how much you would like to support Chronicle.</p>

      {availableTiers.length > 0 ? (
        <div role="radiogroup" aria-label="Supporter tier" className="grid grid-cols-3 gap-2">
          {availableTiers.map((option) => {
            const selected = option === tier
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseTier(option)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border-2 p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                  selected ? "bg-white/10" : "border-white/10 bg-white/[0.025] hover:bg-white/5",
                )}
                style={{
                  borderColor: selected ? TIER_COLOR[option] : undefined,
                }}
              >
                <img src={iconUrl(TIER_ICON[option])} alt="" aria-hidden="true" width={32} height={32} className="size-8" />
                <span className="font-wow text-xs font-bold" style={{ color: TIER_COLOR[option] }}>
                  {billingTierLabel(option)}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {sorted.length > 0 ? (
        <div role="radiogroup" aria-label="Billing period" className="space-y-2">
          {sorted.map((price) => {
            const selected = selectedPrice?.id === price.id
            const discount = billingDiscountPercent(price, monthlyPrice)
            const quality = qualities.get(price.id) ?? "rare"
            return (
              <button
                key={price.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSelectedPriceID(price.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border-2 p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                  selected ? "border-[#c9a227] bg-[#f0c060]/10" : "border-white/10 bg-white/[0.025] hover:border-[#c9a227]/50",
                )}
              >
                <img
                  src={iconUrl(QUALITY_ICON[quality])}
                  alt=""
                  aria-hidden="true"
                  width={36}
                  height={36}
                  className="size-9 shrink-0 rounded border-2"
                  style={{ borderColor: QUALITY_COLOR[quality] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-wow text-sm font-bold" style={{ color: QUALITY_COLOR[quality] }}>
                      {billingPeriodLabel(price.interval_months)}
                    </span>
                    {price.id === bestPriceID ? (
                      <span className="rounded bg-[#ff8000]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ff8000]">Best value</span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formatBillingAmount(price.unit_amount, price.currency)} · {billingPeriodDescription(price.interval_months).toLowerCase()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-white">
                    {formatMonthlyAmount(price)}
                    <span className="text-[10px] font-normal text-muted-foreground">/mo</span>
                  </p>
                  {discount > 0 ? <p className="text-[11px] font-medium text-[#1eff00]">Save {discount}%</p> : null}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Supporter pricing is temporarily unavailable.</p>
      )}

      <button
        type="button"
        className={GOLD_BUTTON}
        disabled={!selectedPrice || checkout.isPending}
        onClick={() => selectedPrice && void openBilling(() => checkout.mutateAsync(selectedPrice.id))}
      >
        <span className="flex flex-col items-center leading-tight">
          <span>Become {tierLabel}</span>
          {selectedPrice ? (
            <span className="mt-0.5 font-sans text-xs font-medium text-[#f0c060]/80">
              Buy now · {formatBillingAmount(selectedPrice.unit_amount, selectedPrice.currency)} {billingPeriodDescription(selectedPrice.interval_months).toLowerCase()}
            </span>
          ) : null}
        </span>
      </button>
      <p className="text-center text-xs text-muted-foreground">Secure checkout with Stripe. Cancel or change tiers anytime.</p>
    </FramePanel>
  )
}

function TierSubscriptionSettings({ billing }: { billing: BillingSummary }) {
  const portal = useCreateBillingPortal()
  const cancel = useCreateBillingCancel()
  const openBilling = useOpenBilling()
  const { hasTierAccess, tierLabel, displayState, subscriptionEnded, cancellationScheduled, statusLabel, heading, periodLabel, effectiveDate } = billingSubscriptionState(billing)
  const displayDate = effectiveDate ? new Date(effectiveDate).toLocaleDateString() : null

  return (
    <section className="max-w-5xl space-y-8">
      <div className="space-y-3">
        <h2 className="font-wow text-3xl leading-tight sm:text-4xl">
          <span style={{ color: hasTierAccess ? GOLD : "#e4e4e7" }}>{heading}</span>
          {hasTierAccess ? <span className="text-white"> with Chronicle</span> : null}
        </h2>
        <p className="max-w-3xl text-muted-foreground">
          {subscriptionEnded && !hasTierAccess
            ? `Your subscription and ${tierLabel} access have ended. Stripe will not renew or charge this subscription again.`
            : subscriptionEnded
              ? `Your subscription has ended, but you remain ${tierLabel}${displayDate ? ` until ${displayDate}` : " while your paid access finishes"}.`
              : cancellationScheduled
                ? `Your subscription will not renew. You remain ${tierLabel}${displayDate ? ` until ${displayDate}` : " until your paid access finishes"}.`
                : hasTierAccess
                  ? `Thank you for supporting Chronicle. Your ${tierLabel} rewards stay active through the end of your paid billing period.`
                  : `Your subscription is recorded, but Stripe has not granted an active ${tierLabel} entitlement yet.`}
        </p>
      </div>

      <Achievement billing={billing} />

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <FramePanel title="Your Subscription">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Standing</dt>
              <dd className={cn("font-wow", hasTierAccess ? "text-[#f0c060]" : "text-[#00c000]")}>{hasTierAccess ? tierLabel : "Friendly"}</dd>
            </div>
            {billing.status ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="text-white">{statusLabel}</dd>
              </div>
            ) : null}
            {displayDate ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{periodLabel}</dt>
                <dd className="text-white">{displayDate}</dd>
              </div>
            ) : null}
          </dl>

          <div className="border-t border-border pt-3">
            <h4 className="font-wow text-sm" style={{ color: "#ffd200" }}>
              {subscriptionEnded
                ? hasTierAccess
                  ? `${tierLabel} access remains`
                  : `${tierLabel} access ended`
                : cancellationScheduled
                  ? "Cancellation scheduled"
                  : displayState === "payment_issue"
                    ? "Payment needs attention"
                    : displayState === "paused"
                      ? "Subscription paused"
                      : "Manage or cancel"}
            </h4>
            {subscriptionEnded ? (
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {hasTierAccess
                  ? `Stripe will not renew or charge this subscription again. Your existing ${tierLabel} access remains available${displayDate ? ` until ${displayDate}` : " until the paid period finishes"}. Once this subscription is fully expired, you can return here to choose a new tier.`
                  : `Stripe will not renew or charge this subscription again. No active ${tierLabel} entitlement is recorded, so its rewards are no longer available.`}
              </p>
            ) : cancellationScheduled ? (
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                Your subscription will not renew. Your {tierLabel} rewards remain available until
                {displayDate ? ` ${displayDate}` : " the end of your paid access"}. Once this subscription is fully expired, you can return here to choose a new tier.
              </p>
            ) : displayState === "payment_issue" ? (
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                Stripe could not confirm the latest payment. Open the billing portal to update your payment method or review the invoice.
              </p>
            ) : displayState === "paused" ? (
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Stripe reports this subscription as paused. Open the billing portal to review its billing state.</p>
            ) : (
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                Change tiers, update your payment method, or view invoices in the Stripe billing portal. Stripe shows when a tier change takes effect before you confirm it. If you
                cancel, your {tierLabel} rewards stay active until
                {displayDate ? ` ${displayDate}` : " the end of your billing period"}.
              </p>
            )}
          </div>

          <button type="button" className={GOLD_BUTTON} disabled={portal.isPending} onClick={() => void openBilling(() => portal.mutateAsync(), true)}>
            {portal.isPending ? "Opening Stripe…" : subscriptionEnded || cancellationScheduled ? "View Stripe Billing History" : "Change or Manage Subscription"}
          </button>
          {!subscriptionEnded && !cancellationScheduled ? (
            <button
              type="button"
              className="w-full rounded-md border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
              disabled={cancel.isPending}
              onClick={() => void openBilling(() => cancel.mutateAsync())}
            >
              {cancel.isPending ? "Opening Stripe…" : "Cancel Subscription"}
            </button>
          ) : null}
        </FramePanel>

        <div>
          <h3 className="font-wow text-xl font-semibold">{tierLabel} Rewards</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {REWARDS.map((reward) => (
              <RewardTooltip key={reward.title} reward={reward} unlocked={hasTierAccess} tierLabel={tierLabel} />
            ))}
          </div>
        </div>
      </div>

      <details className={cn(FRAME, "group text-sm")}>
        <summary className="cursor-pointer rounded-lg px-4 py-2 font-wow text-sm marker:text-[#f0c060] group-open:rounded-b-none group-open:border-b group-open:border-border">
          <span style={{ color: GOLD }}>Active feature entitlements ({billing.entitlements.length})</span>
          <span className="ml-2 font-sans text-xs text-muted-foreground">Debug details</span>
        </summary>
        <div className="space-y-3 p-4">
          {billing.customer_id ? (
            <p className="text-xs text-muted-foreground">
              Stripe customer <code className="rounded border border-border bg-black/30 px-2 py-1 text-xs text-zinc-200 select-all">{billing.customer_id}</code>
            </p>
          ) : null}
          {billing.entitlements.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {billing.entitlements.map((entitlement) => (
                <li key={entitlement}>
                  <code className="rounded border border-border bg-black/30 px-2 py-1 text-xs text-[#f0c060]">{entitlement}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-amber-300">No active Stripe feature entitlements are currently recorded for this account.</p>
          )}
        </div>
      </details>

      <p className="text-center text-sm text-muted-foreground">
        For any billing issues, contact{" "}
        <a className="text-[#f0c060] underline decoration-[#f0c060]/40 underline-offset-4 hover:text-[#ffd580]" href="mailto:support@chronicleclassic.com">
          support@chronicleclassic.com
        </a>
        .
      </p>
    </section>
  )
}
