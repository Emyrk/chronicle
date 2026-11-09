import type { Meta, StoryObj } from "@storybook/react-vite"
import { delay, http, HttpResponse } from "msw"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { expect, within } from "storybook/test"
import { LeaderboardsLiveHub } from "./LeaderboardsLiveHub"

const SUMMARY = "/api/v1/rankings/ratings/hub-summary"
const siteConfig = http.get("/api/v1/site-config", () => HttpResponse.json({ root_tenant_ratings_disabled: false }))
const failing = [siteConfig, http.get(SUMMARY, () => HttpResponse.json({ message: "boom" }, { status: 500 }))]
const pending = [siteConfig, http.get(SUMMARY, async () => { await delay("infinite"); return HttpResponse.json({}) })]

/** The live /leaderboard-v2 page while its summary loads or after it fails. */
const meta = {
  title: "Pages/Leaderboards/LiveHub",
  component: LeaderboardsLiveHub,
  parameters: { layout: "fullscreen" },
  render: () => <LeaderboardsLiveHub />,
} satisfies Meta<typeof LeaderboardsLiveHub>

export default meta
type Story = StoryObj<typeof meta>

const at = (url: string) => (Story: () => React.ReactNode) => (
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/leaderboard-v2" element={<Story />} />
      <Route path="/leaderboard-v2/:segment" element={<Story />} />
      <Route path="/leaderboard-v2/:instance/:tab" element={<Story />} />
    </Routes>
  </MemoryRouter>
)

export const LandingLoading: Story = { decorators: [at("/leaderboard-v2")], parameters: { msw: { handlers: pending } } }

export const LandingError: Story = {
  decorators: [at("/leaderboard-v2")],
  parameters: { msw: { handlers: failing } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText("Could not load leaderboards")).toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  },
}

export const InstanceLoading: Story = {
  decorators: [at("/leaderboard-v2/Molten-Core/ratings")],
  parameters: { msw: { handlers: pending } },
}

export const InstanceError: Story = {
  decorators: [at("/leaderboard-v2/Molten-Core/ratings")],
  parameters: { msw: { handlers: failing } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText("Could not load leaderboards")).toBeInTheDocument()
    await expect(canvas.getByRole("heading", { level: 1, name: "Molten Core" })).toBeInTheDocument()
  },
}
