import type { Meta, StoryObj } from "@storybook/react-vite"
import { http, HttpResponse, delay } from "msw"
import { MemoryRouter } from "react-router-dom"
import type { BillingPrice, BillingSummary } from "@/api/typesGenerated"
import { BillingSettings } from "./BillingSettings"

const PERIOD_END = "2026-11-23T00:00:00Z"

function tierPrices(tier: string, monthly: number): BillingPrice[] {
  return [
    { id: `price_${tier}_1`, tier, currency: "usd", unit_amount: monthly, interval_months: 1 },
    { id: `price_${tier}_6`, tier, currency: "usd", unit_amount: Math.round(monthly * 6 * 0.9), interval_months: 6 },
    { id: `price_${tier}_12`, tier, currency: "usd", unit_amount: Math.round(monthly * 12 * 0.8), interval_months: 12 },
  ]
}

const PRICES = [...tierPrices("honored", 300), ...tierPrices("revered", 500), ...tierPrices("exalted", 1000)]

function billing(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    enabled: true,
    tier: "free",
    ads_free: false,
    has_subscription: false,
    has_billing_account: false,
    can_checkout: true,
    entitlements: [],
    prices: PRICES,
    ...overrides,
  }
}

function subscribed(tier: string, overrides: Partial<BillingSummary> = {}): BillingSummary {
  return billing({
    tier,
    ads_free: true,
    has_subscription: true,
    has_billing_account: true,
    can_checkout: false,
    status: "active",
    current_period_end: PERIOD_END,
    customer_id: "cus_StoryCustomer123",
    entitlements: [`chronicle-${tier}`],
    ...overrides,
  })
}

function handlers({ summary, signedIn = true, billingEnabled = true, loading = false }: { summary?: BillingSummary; signedIn?: boolean; billingEnabled?: boolean; loading?: boolean }) {
  return [
    http.get("/api/v1/site-config", () =>
      HttpResponse.json({ signups_enabled: true, client_uploads_disabled: false, billing_enabled: billingEnabled, ads_enabled: false, tenant: null }),
    ),
    http.get("/api/v1/whoami", () =>
      signedIn ? HttpResponse.json({ user_id: "user-1", session_id: "session-1", roles: [], ads_free: summary?.ads_free ?? false }) : new HttpResponse(null, { status: 204 }),
    ),
    http.get("/api/v1/me/billing", async () => {
      if (loading) await delay("infinite")
      return HttpResponse.json(summary ?? billing())
    }),
  ]
}

const meta = {
  title: "Pages/Settings/Billing",
  component: BillingSettings,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/account/billing"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof BillingSettings>

export default meta
type Story = StoryObj<typeof meta>

// Gates

export const SignedOut: Story = {
  parameters: { msw: { handlers: handlers({ signedIn: false }) } },
}

export const Loading: Story = {
  parameters: { msw: { handlers: handlers({ loading: true }) } },
}

export const SubscriptionsUnavailable: Story = {
  parameters: { msw: { handlers: handlers({ summary: billing({ enabled: false, prices: [] }) }) } },
}

// Not subscribed

export const PlanPicker: Story = {
  parameters: { msw: { handlers: handlers({ summary: billing() }) } },
}

export const PlanPickerHonoredOnly: Story = {
  parameters: { msw: { handlers: handlers({ summary: billing({ prices: tierPrices("honored", 300) }) }) } },
}

export const FormerSubscriber: Story = {
  parameters: { msw: { handlers: handlers({ summary: billing({ has_billing_account: true, customer_id: "cus_StoryCustomer123" }) }) } },
}

// Active subscriptions

export const ActiveHonored: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("honored") }) } },
}

export const ActiveRevered: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("revered") }) } },
}

export const ActiveExalted: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("exalted") }) } },
}

export const Trialing: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("revered", { status: "trialing" }) }) } },
}

export const PaymentIssue: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("revered", { status: "past_due" }) }) } },
}

export const Paused: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("revered", { status: "paused", ads_free: false, entitlements: [] }) }) } },
}

export const AccessPending: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("revered", { ads_free: false, entitlements: [] }) }) } },
}

// Canceled / ended

export const CancelingAtPeriodEnd: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("exalted", { cancel_at_period_end: true }) }) } },
}

export const CancelingOnExplicitDate: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("revered", { cancel_at: "2026-11-30T00:00:00Z", current_period_end: "2027-04-30T00:00:00Z" }) }) } },
}

export const EndedWithAccessRemaining: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("revered", { status: "canceled" }) }) } },
}

export const EndedNoAccess: Story = {
  parameters: { msw: { handlers: handlers({ summary: subscribed("revered", { status: "canceled", ads_free: false, entitlements: [] }) }) } },
}
