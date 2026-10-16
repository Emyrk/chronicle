import { useState } from "react"
import type { BillingPrice, BillingSummary } from "@/api/typesGenerated"
import { useCreateBillingCheckout, useCreateBillingPortal, useBillingSummary } from "@/api/queries"
import { iconUrl } from "@/config/iconUrl"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  EXALTED_TIER_NAME,
  type BillingQuality,
  bestValuePriceID,
  billingDiscountPercent,
  billingPeriodDescription,
  billingPeriodLabel,
  billingPriceQualities,
  billingTierLabel,
  formatBillingAmount,
  formatMonthlyAmount,
} from "./billingPricing"

// Styling mirrors the landing site's /support page: gold Friz Quadrata headings,
// brown framed panels, and WoW item tooltips.
const GOLD = "#f0c060"
const FRAME = "rounded-xl border-2 border-[#6b5320] bg-[#1e1710] shadow-xl shadow-black/30"
const TOOLTIP = "rounded-lg border-2 border-[#4a4a6a] bg-[#1a1a2e] shadow-lg"

// WoW reputation standings, in order. Free users sit at Friendly; Exalted fills the bar.
const STANDINGS = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"] as const

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
    title: "Private Logs",
    icon: "ability_stealth",
    effects: ["Equip: Keeps your uploads out of public view."],
    flavor: "What happens in progression stays in progression.",
  },
]

export function BillingSettings() {
  const { data: billing, isLoading } = useBillingSummary()

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

  const exalted = billing.ads_free

  return (
    <section className="max-w-5xl space-y-8">
      <h2 className="font-wow text-3xl leading-tight sm:text-4xl">
        <span style={{ color: GOLD }}>{exalted ? "You are Exalted" : "Become Exalted"}</span>{" "}
        <span className="text-white">with Chronicle</span>
      </h2>

      <Achievement billing={billing} />

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {exalted ? <SubscriptionPanel billing={billing} /> : <PlanPicker prices={billing.prices ?? []} />}

        <div>
          <h3 className="font-wow text-xl font-semibold">{EXALTED_TIER_NAME} Rewards</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {REWARDS.map((reward) => (
              <RewardTooltip key={reward.title} reward={reward} unlocked={exalted} />
            ))}
          </div>
        </div>
      </div>

      <ComparisonTable exalted={exalted} />
    </section>
  )
}

const COMPARISON = [
  {
    feature: "Log parsing, panels, rankings, and replays",
    friendly: "Full access. Core analysis is never paywalled.",
    exalted: "Full access, same as everyone.",
  },
  {
    feature: "Advertisements",
    friendly: "Limited ads appear on some pages to help cover hosting costs.",
    exalted: "No ads anywhere on Chronicle.",
  },
  {
    feature: "Log storage",
    friendly: "The standard storage allowance for your uploads.",
    exalted: "An extra 300 MB on top of the standard allowance.",
  },
  {
    feature: "Raw log downloads",
    friendly: "Browse parsed logs on Chronicle.",
    exalted: "Also download the original combat log file behind any of your uploads.",
  },
  {
    feature: "Private logs",
    friendly: "Uploads are publicly viewable.",
    exalted: "Keep uploads private so only you can view them.",
  },
]

/** Plain-language breakdown of what Exalted changes compared to the free tier. */
function ComparisonTable({ exalted }: { exalted: boolean }) {
  return (
    <div className={FRAME}>
      <h3
        className="rounded-t-[10px] border-b-2 border-[#6b5320] px-4 py-2.5 text-center font-wow text-base font-bold tracking-[0.08em]"
        style={{ color: GOLD }}
      >
        Friendly vs Exalted
      </h3>
      <div className="overflow-hidden rounded-b-[10px] bg-[#17130f]">
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-4 border-b border-[#6b5320]/60 px-5 py-2.5 font-wow text-sm sm:grid">
          <span className="text-muted-foreground">Feature</span>
          <span className={cn(exalted ? "text-muted-foreground" : "text-[#00c000]")}>
            Friendly <span className="font-sans text-xs text-muted-foreground">(free)</span>
          </span>
          <span style={{ color: GOLD }}>{EXALTED_TIER_NAME}</span>
        </div>
        <dl className="divide-y divide-white/5">
          {COMPARISON.map(({ feature, friendly, exalted: exaltedText }) => (
            <div
              key={feature}
              className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] sm:gap-4"
            >
              <dt className="font-medium text-white">{feature}</dt>
              <dd className="text-muted-foreground">
                <span className="mr-1 font-wow text-xs text-[#00c000] sm:hidden">Friendly:</span>
                {friendly}
              </dd>
              <dd className="text-zinc-200">
                <span className="mr-1 font-wow text-xs sm:hidden" style={{ color: GOLD }}>
                  {EXALTED_TIER_NAME}:
                </span>
                {exaltedText}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function useOpenBilling() {
  return async (action: () => Promise<string>) => {
    try {
      window.location.assign(await action())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open billing")
    }
  }
}

/** WoW achievement row: greyed out with a reputation progress bar until earned. */
function Achievement({ billing }: { billing: BillingSummary }) {
  const exalted = billing.ads_free
  const standing = exalted ? EXALTED_TIER_NAME : billingTierLabel(billing.tier)
  const standingIndex = Math.max(0, STANDINGS.indexOf(standing as (typeof STANDINGS)[number]))
  // Free users show a sliver of progress into their standing; Exalted is a full bar.
  const fill = exalted ? 100 : ((standingIndex + 0.15) / STANDINGS.length) * 100

  return (
    <div className={cn(FRAME, "p-4 sm:p-5", !exalted && "border-[#4a4030]")}>
      <div className="flex items-center gap-4">
        <img
          src={iconUrl("inv_crown_01")}
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
          className={cn(
            "size-14 shrink-0 rounded border-2 sm:size-16",
            exalted ? "border-[#c9a227]" : "border-zinc-600 opacity-60 grayscale",
          )}
        />
        <div className="min-w-0 flex-1 text-center">
          <p className="font-wow text-xl font-bold sm:text-2xl" style={{ color: exalted ? GOLD : "#a1a1aa" }}>
            {EXALTED_TIER_NAME}
          </p>
          <p className="mt-0.5 text-sm text-zinc-300">Raise your reputation with Chronicle to Exalted.</p>
        </div>
        <div className="flex w-16 shrink-0 flex-col items-center gap-1">
          <PointsShield earned={exalted} />
          {exalted && billing.current_period_end ? (
            <span className="text-[10px] text-zinc-400">
              {billing.cancel_at_period_end ? "Ends" : "Renews"}{" "}
              {new Date(billing.current_period_end).toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" })}
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
          <div
            className={cn("h-full", exalted ? "bg-[#00aa88]" : "bg-[#00a000]")}
            style={{ width: `${fill}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center font-wow text-xs text-white [text-shadow:1px_1px_1px_#000]">
            Chronicle – {standing}
          </span>
        </div>
      </div>

      <p className="mt-4 border-t border-[#6b5320]/60 pt-3 text-center font-wow text-sm" style={{ color: "#ffd200" }}>
        Reward: Ad-free browsing, +300 MB storage, raw log downloads, and private logs
      </p>
    </div>
  )
}

function PointsShield({ earned }: { earned: boolean }) {
  return (
    <svg viewBox="0 0 40 46" className="h-12 w-11" aria-label="10 points">
      <path
        d="M20 2 L37 8 V22 C37 33 29 40 20 44 C11 40 3 33 3 22 V8 Z"
        fill={earned ? "#8a6a1a" : "#3f3f46"}
        stroke={earned ? "#e8c45a" : "#71717a"}
        strokeWidth="2.5"
      />
      <text
        x="20"
        y="28"
        textAnchor="middle"
        fontSize="15"
        fontWeight="bold"
        fill={earned ? "#fff" : "#a1a1aa"}
        style={{ textShadow: "1px 1px 1px #000" }}
      >
        10
      </text>
    </svg>
  )
}

/** Reward styled like the /support page's item tooltips. Red requirement lines mean "not yet earned". */
function RewardTooltip({ reward, unlocked }: { reward: (typeof REWARDS)[number]; unlocked: boolean }) {
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
        <div className="text-white">Binds when Exalted</div>
        <div style={{ color: unlocked ? "#ffffff" : "#ff2020" }}>Requires Chronicle – Exalted</div>
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

function FramePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cn(FRAME, "lg:sticky lg:top-4")}>
      <h3
        className="rounded-t-[10px] border-b-2 border-[#6b5320] px-4 py-2.5 text-center font-wow text-base font-bold tracking-[0.08em]"
        style={{ color: GOLD }}
      >
        {title}
      </h3>
      <div className="space-y-3 rounded-b-[10px] bg-[#17130f] p-4">{children}</div>
    </div>
  )
}

const GOLD_BUTTON =
  "flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#c9a227]/70 bg-[#2a210f] px-4 py-2.5 font-wow text-base font-bold text-[#f0c060] transition-colors hover:bg-[#3a2d14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50"

function PlanPicker({ prices }: { prices: readonly BillingPrice[] }) {
  const checkout = useCreateBillingCheckout()
  const openBilling = useOpenBilling()
  const [selectedPriceID, setSelectedPriceID] = useState<string | null>(null)

  const monthlyPrice = prices.find((price) => price.interval_months === 1)
  const bestPriceID = bestValuePriceID(prices, monthlyPrice)
  const selectedPrice = prices.find((price) => price.id === (selectedPriceID ?? monthlyPrice?.id)) ?? prices[0]
  const qualities = billingPriceQualities(prices)
  const sorted = [...prices].sort((a, b) => b.interval_months - a.interval_months)

  return (
    <FramePanel title="Choose Your Path">
      <p className="text-center text-xs text-muted-foreground">
        Every plan grants the same rewards. Longer paths cost less per month.
      </p>

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
                  selected ? "border-[#c9a227] bg-[#2a210f]" : "border-white/10 bg-white/[0.025] hover:border-[#6b5320]",
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
                      <span className="rounded bg-[#ff8000]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ff8000]">
                        Best value
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formatBillingAmount(price.unit_amount, price.currency)} ·{" "}
                    {billingPeriodDescription(price.interval_months).toLowerCase()}
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
        <p className="rounded-md border border-dashed border-[#6b5320] p-4 text-center text-sm text-muted-foreground">
          {EXALTED_TIER_NAME} pricing is temporarily unavailable.
        </p>
      )}

      <button
        type="button"
        className={GOLD_BUTTON}
        disabled={!selectedPrice || checkout.isPending}
        onClick={() => selectedPrice && void openBilling(() => checkout.mutateAsync(selectedPrice.id))}
      >
        <span className="flex flex-col items-center leading-tight">
          <span>Become {EXALTED_TIER_NAME}</span>
          {selectedPrice ? (
            <span className="mt-0.5 font-sans text-xs font-medium text-[#f0c060]/80">
              Buy now · {formatBillingAmount(selectedPrice.unit_amount, selectedPrice.currency)}{" "}
              {billingPeriodDescription(selectedPrice.interval_months).toLowerCase()}
            </span>
          ) : null}
        </span>
      </button>
      <p className="text-center text-xs text-muted-foreground">Secure checkout with Stripe. Cancel anytime.</p>
    </FramePanel>
  )
}

function SubscriptionPanel({ billing }: { billing: BillingSummary }) {
  const portal = useCreateBillingPortal()
  const openBilling = useOpenBilling()

  return (
    <FramePanel title="Your Standing">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Reputation</dt>
          <dd className="font-wow" style={{ color: GOLD }}>
            {EXALTED_TIER_NAME}
          </dd>
        </div>
        {billing.status ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="capitalize text-white">{billing.cancel_at_period_end ? "Canceling" : billing.status}</dd>
          </div>
        ) : null}
        {billing.current_period_end ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{billing.cancel_at_period_end ? "Ends" : "Renews"}</dt>
            <dd className="text-white">{new Date(billing.current_period_end).toLocaleDateString()}</dd>
          </div>
        ) : null}
      </dl>
      <button
        type="button"
        className={GOLD_BUTTON}
        disabled={portal.isPending}
        onClick={() => void openBilling(() => portal.mutateAsync())}
      >
        Manage Subscription
      </button>
    </FramePanel>
  )
}
