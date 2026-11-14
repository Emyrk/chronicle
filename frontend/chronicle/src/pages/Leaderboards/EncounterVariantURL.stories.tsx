import type { Meta, StoryObj } from "@storybook/react-vite"
import { http, HttpResponse } from "msw"
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import { LeaderboardsLiveHub } from "./LeaderboardsLiveHub"

const requests = fn<(path: string, variant: string | null, offset: string | null) => void>()
const ratingRequests = fn<(params: Record<string, string>) => void>()
const instances = ["Ulduar", "Naxxramas"]
const handlers = [
  http.get("/api/v1/whoami", () => HttpResponse.json({}, { status: 401 })),
  http.get("/c/*", () => new HttpResponse(null, { status: 204 })),
  http.get("/api/v1/site-config", () => HttpResponse.json({ root_tenant_ratings_disabled: false })),
  http.get("/api/v1/realms", () => HttpResponse.json([{ id: "realm-1", name: "Test realm" }])),
  http.get("/api/v1/raidlogs/supported", () => HttpResponse.json([])),
  http.get("/api/v1/leaderboard-configuration", () => HttpResponse.json({
    tenant_id: "test", effective_flavor: "wotlk", rows: instances.flatMap(instance_name => [
      { kind: "instance", instance_name },
      { kind: "variant", instance_name, difficulty_name: "Normal", max_players: 10 },
      { kind: "set", instance_name, set_key: "default", set_name: "Default" },
      ...["Hodir", "XT-002 Deconstructor", "Freya"].map((encounter_name, position) => ({ kind: "member", instance_name, set_key: "default", encounter_name, position })),
      ...["Hodir", "XT-002 Deconstructor", "Freya"].map(encounter_name => ({ kind: "boss", instance_name, encounter_name })),
    ]),
  })),
  http.get("/api/v1/rankings/instances", () => HttpResponse.json(instances.map(instance_name => ({ instance_name, category: "raid", difficulty_name: "Normal", max_players: 10, total_kills: 1 })))),
  http.get("/api/v1/leaderboards-v2", ({ request }) => {
    const params = new URL(request.url).searchParams
    if (params.get("view") === "cohorts") return HttpResponse.json([])
    ratingRequests(Object.fromEntries(params))
    return HttpResponse.json({ status: "ready", entries: [], included_bosses: ["Hodir"], next_cursor: null })
  }),
  http.get("/api/v1/rankings/leaderboard", ({ request }) => {
    const url = new URL(request.url)
    requests(url.pathname, url.searchParams.get("encounter_variants"), url.searchParams.get("offset"))
    return HttpResponse.json({ entries: [], total_count: 0 })
  }),
  http.get("/api/v1/rankings/kill-time-leaderboard", ({ request }) => {
    const url = new URL(request.url)
    requests(url.pathname, url.searchParams.get("encounter_variants"), null)
    return HttpResponse.json({ entries: [], total_count: 0 })
  }),
  http.get("/api/v1/rankings/speedrun", () => HttpResponse.json([])),
]

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return <div>
    <output data-testid="location">{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>History back</button>
    <button onClick={() => navigate(1)}>History forward</button>
  </div>
}
const at = (url: string) => () => <MemoryRouter initialEntries={[url]}>
  <LocationProbe />
  <Routes>
    <Route path="/leaderboards" element={<LeaderboardsLiveHub />} />
    <Route path="/leaderboards/:segment" element={<LeaderboardsLiveHub />} />
    <Route path="/leaderboards/:instance/:tab" element={<LeaderboardsLiveHub />} />
  </Routes>
</MemoryRouter>
const hard = '{"Hodir":"hard"}'
const initial = `/leaderboards/Ulduar/performances?${new URLSearchParams({ encounter_variants: hard, encounters: "Hodir", realm_ids: "realm-1", difficulty: "Normal", size: "10", spec: "Frost", subject: "characters", page: "3" })}`
const meta = {
  title: "Pages/Leaderboards/EncounterVariantURL",
  component: LeaderboardsLiveHub,
  parameters: { layout: "fullscreen", msw: { handlers } },
  beforeEach: () => { requests.mockClear(); ratingRequests.mockClear() },
} satisfies Meta<typeof LeaderboardsLiveHub>
export default meta
type Story = StoryObj<typeof meta>

export const SharedLinkAndNavigation: Story = {
  render: at(initial),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const params = () => new URL(canvas.getByTestId("location").textContent!, "https://test").searchParams
    const chip = (name: string) => canvas.getByRole("button", { name: `Hodir ${name}`, exact: true })
    await expect(await canvas.findByRole("button", { name: "Hodir Hard mode", exact: true })).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(requests).toHaveBeenCalledWith("/api/v1/rankings/leaderboard", hard, "100"))
    await userEvent.click(chip("Combined"))
    await waitFor(() => expect(params().has("encounter_variants")).toBe(false))
    await expect(params().has("page")).toBe(false)
    await expect(chip("Combined")).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(chip("Hard mode"))
    await waitFor(() => expect(params().get("encounter_variants")).toBe(hard))
    for (const key of ["encounters", "realm_ids", "difficulty", "size", "spec", "subject"]) {
      await expect(params().get(key)).toBe(new URL(initial, "https://test").searchParams.get(key))
    }
    await userEvent.click(await canvas.findByRole("button", { name: "History back" }))
    await waitFor(() => expect(chip("Combined")).toHaveAttribute("aria-pressed", "true"))
    await userEvent.click(canvas.getByRole("button", { name: "History forward" }))
    await waitFor(() => expect(chip("Hard mode")).toHaveAttribute("aria-pressed", "true"))
    await waitFor(() => expect(requests).toHaveBeenCalledWith("/api/v1/rankings/leaderboard", hard, "0"))
    await userEvent.click(chip("Normal"))
    await waitFor(() => expect(params().get("encounter_variants")).toBe('{"Hodir":"normal"}'))
    await expect(chip("Normal")).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(chip("Hard mode"))
    await userEvent.click(canvas.getByRole("button", { name: "Hard mode", exact: true }))
    await waitFor(() => expect(params().has("encounter_variants")).toBe(false))
    await userEvent.click(canvas.getByRole("button", { name: "Hard mode", exact: true }))
    await waitFor(() => expect(params().get("encounter_variants")).toBe(hard))
    const tabs = within(canvas.getByRole("navigation", { name: "Leaderboard section" }))
    await userEvent.click(tabs.getByRole("link", { name: "Speedruns" }))
    await waitFor(() => expect(chip("Hard mode")).toBeDisabled())
    await expect(chip("Hard mode")).toHaveAttribute("aria-pressed", "true")
    await expect(params().get("encounter_variants")).toBe(hard)
    await waitFor(() => expect(requests).toHaveBeenCalledWith("/api/v1/rankings/kill-time-leaderboard", null, null))
    await userEvent.click(tabs.getByRole("link", { name: "Performances" }))
    await waitFor(() => expect(chip("Hard mode")).toBeEnabled())
    await expect(chip("Hard mode")).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(canvas.getByRole("button", { name: "Ulduar, switch instance" }))
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Naxxramas" }))
    await waitFor(() => expect(canvas.getByTestId("location")).toHaveTextContent("/leaderboards/Naxxramas/performances"))
    await expect(params().has("encounter_variants")).toBe(false)
    await userEvent.click(await canvas.findByRole("button", { name: "History back" }))
    await waitFor(() => expect(chip("Hard mode")).toHaveAttribute("aria-pressed", "true"))
    await userEvent.click(canvas.getByTitle("All instances"))
    await waitFor(() => expect(params().has("encounter_variants")).toBe(false))
  },
}

export const InvalidSharedLink: Story = {
  render: at(`/leaderboards/Ulduar/performances?${new URLSearchParams({ encounter_variants: '{"Freya":"hard","Hodir":"unknown"}' })}`),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole("button", { name: "Hodir Combined", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByTestId("location")).toHaveTextContent(/^\/leaderboards\/Ulduar\/performances$/)
    await waitFor(() => expect(requests).toHaveBeenCalledWith("/api/v1/rankings/leaderboard", null, "0"))
    await expect(requests.mock.calls.every(([, variant]) => variant === null)).toBe(true)
  },
}

export const ShortcutResetsPage: Story = {
  render: at(initial.replace(encodeURIComponent(hard), encodeURIComponent('{"Hodir":"normal"}'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole("button", { name: "Hodir Normal", exact: true })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(canvas.getByRole("button", { name: "Hard mode", exact: true }))
    await waitFor(() => {
      const params = new URL(canvas.getByTestId("location").textContent!, "https://test").searchParams
      expect(params.get("encounter_variants")).toBe(hard)
      expect(params.has("page")).toBe(false)
    })
    await waitFor(() => expect(requests).toHaveBeenCalledWith("/api/v1/rankings/leaderboard", hard, "0"))
    await expect(requests.mock.calls.some(([, variant, offset]) => variant === hard && offset === "100")).toBe(false)
  },
}

export const RatingsSharedLink: Story = {
  render: at(initial.replace("/performances?", "/ratings?rating=peak&")),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole("button", { name: "Hodir Hard mode", exact: true })).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(ratingRequests).toHaveBeenCalledWith(expect.objectContaining({
      encounter_variants: hard, instance: "Ulduar", boss: "Hodir", score: "peak",
      realm: "realm-1", difficulty: "Normal", max_players: "10", subject: "player",
    })))
    const params = new URL(canvas.getByTestId("location").textContent!, "https://test").searchParams
    for (const [key, value] of new URL(initial, "https://test").searchParams) {
      await expect(params.get(key)).toBe(value)
    }
  },
}

export const IndependentXTAndHodir: Story = {
  render: at(`/leaderboards/Ulduar/performances?${new URLSearchParams({ encounters: "Hodir,XT-002 Deconstructor", encounter_variants: '{"Hodir":"hard","XT-002 Deconstructor":"normal"}' })}`),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mixed = '{"Hodir":"hard","XT-002 Deconstructor":"normal"}'
    await expect(await canvas.findByRole("button", { name: "XT-002 Deconstructor Normal", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByRole("button", { name: "Hodir Hard mode", exact: true })).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(requests).toHaveBeenCalledWith("/api/v1/rankings/leaderboard", mixed, "0"))
    const tabs = within(canvas.getByRole("navigation", { name: "Leaderboard section" }))
    await userEvent.click(tabs.getByRole("link", { name: "Speedruns" }))
    await waitFor(() => expect(canvas.getByRole("button", { name: "XT-002 Deconstructor Normal", exact: true })).toBeDisabled())
    await waitFor(() => expect(requests).toHaveBeenCalledWith("/api/v1/rankings/kill-time-leaderboard", null, null))
    await userEvent.click(tabs.getByRole("link", { name: "Performances" }))
    await userEvent.click(canvas.getByRole("button", { name: "Hard mode", exact: true }))
    await waitFor(() => expect(requests).toHaveBeenCalledWith("/api/v1/rankings/leaderboard", '{"Hodir":"hard","XT-002 Deconstructor":"hard"}', "0"))
  },
}
