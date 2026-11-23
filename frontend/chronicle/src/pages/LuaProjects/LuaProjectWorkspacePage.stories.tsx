import { useMemo } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { delay, http, HttpResponse } from "msw"
import { strToU8, zipSync } from "fflate"
import { userEvent, within } from "storybook/test"
import { createMemoryRouter, Route, RouterProvider, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/Sonner/Sonner"
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip"
import { InferenceRuntimeProvider } from "@/features/chat/runtime"
import { LocalMcpProvider } from "@/features/chat/mcp/LocalMcpProvider"
import { LOCAL_MCP_ORIGIN } from "@/features/chat/mcp/localBridge"
import type { RecentInstancesResponse } from "@/api/typesGenerated"
import instanceFixture from "../Instance/EventsPanels/__fixtures__/instance.json"
import damageFixture from "../Instance/EventsPanels/__fixtures__/damage.bin?url"
import healFixture from "../Instance/EventsPanels/__fixtures__/heal.bin?url"
import type { LuaProject } from "./api"
import { ModuleWorkspaceByPath } from "./LuaProjectWorkspacePage"

/*
 * The real Module Workshop route (/modules/<author>/<slug>/edit) over MSW: the module API, a recorded
 * Zul'Gurub instance and its event streams, Chronicle's tool catalog, and a fake chronicle-mcp daemon on
 * 127.0.0.1:17643 that speaks protocol 3. "Agent" stories script that daemon so a coding agent reads,
 * edits, previews and saves through the same bridge the page uses in production.
 */

const PROJECT_ID = "5b0c7f0e-1d2a-4c55-9e7b-3f6a1c2d4e5f"
const MAIN_SHA = "9f2c1e7a4b3d5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8"
const INSTANCE_ID = instanceFixture.id
const HAKKAR = instanceFixture.encounters.find(encounter => encounter.name === "Hakkar")!.id

const MANIFEST = JSON.stringify({ manifest_version: 1, kind: "panel", name: "Raid Damage Meter", slug: "raid-damage-meter",
  entrypoint: "main.lua", capabilities: ["ui"], streams: ["damage"], filter_mode: "none", assets: [] }, null, 2) + "\n"
const MAIN_LUA = `-- Raid Damage Meter
local ui = require("chronicle.v1.ui")
local damage = require("chronicle.v1.events.damage")

local chart = ui.playerMetricChart(UIParent, "damage-chart", {
  type = "damage",
  panelTitle = "Damage Done",
  perSecond = true,
  width = 560,
  height = 420,
})

local totals, longest = {}, 1
damage.onEvent(function(event)
  totals[event.source] = (totals[event.source] or 0) + event.amount
  if event.offsetMs > longest then longest = event.offsetMs end
end)

damage.onComplete(function()
  local rows = {}
  for guid, total in pairs(totals) do
    local unit = Chronicle.GetUnit(guid)
    if unit and unit.player then
      rows[#rows + 1] = { playerID = guid, playerName = unit.name, className = unit.class, value = total }
    end
  end
  table.sort(rows, function(a, b) return a.value > b.value end)
  chart:SetDuration(longest)
  chart:SetData(rows)
end)
`
const README = "# Raid Damage Meter\n\nDamage done per player for the selected encounters.\n"
const DRAFT_ZIP = zipSync({ "project.json": strToU8(MANIFEST), "main.lua": strToU8(MAIN_LUA), "README.md": strToU8(README) })

/** The same meter opted into incremental Replay: it redraws in OnReplayTime, so totals grow with the playhead. */
const REPLAY_MANIFEST = JSON.stringify({ ...JSON.parse(MANIFEST), replay: "incremental" }, null, 2) + "\n"
const REPLAY_LUA = MAIN_LUA.replace("damage.onComplete(function()", "local function draw()").replace(/end\)\n$/, `end
damage.onComplete(draw)
Chronicle.OnReplayTime(function(ms)
  if ms then longest = math.max(1, ms) end
  draw()
end)
`)
const REPLAY_ZIP = zipSync({ "project.json": strToU8(REPLAY_MANIFEST), "main.lua": strToU8(REPLAY_LUA), "README.md": strToU8(README) })

function project(overrides: Partial<LuaProject> = {}): LuaProject {
  return {
    id: PROJECT_ID, owner_id: "user-1", published: false, kind: "panel", name: "Raid Damage Meter", slug: "raid-damage-meter", revision: 7,
    description: "Damage done per player.", author: "forgewright", stars: 12, starred: true,
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-11-18T00:00:00Z",
    main: { sha256: MAIN_SHA, updated_at: "2026-11-18T00:00:00Z" },
    releases: [{ tag: "v1", available: true, sha256: "older", published_at: "2026-11-10T00:00:00Z" }],
    ...overrides,
  }
}

const RECENT: RecentInstancesResponse = { has_more: false, instances: [{
  id: INSTANCE_ID, slug: instanceFixture.slug, name: "Zul'Gurub", realm_id: "realm-1", realm_name: "Nordanaar", uploader_id: "user-1",
  uploader_name: "forgewright", uploaded_at: "2026-11-17T21:00:00Z", first_encounter_time: "2026-11-17T19:30:00Z",
  player_count: 15, boss_count: 8, boss_kills: 8, duration_ms: 7_200_000,
} as RecentInstancesResponse["instances"][number]] }

const schema = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false })
const TOOLS = [
  ...["gen_page_context", "list_skill", "read_skill"].map(name => ({ name, description: `Page guidance: ${name}.`, input_schema: schema(name === "read_skill" ? { skill_id: { type: "string" } } : {}, name === "read_skill" ? ["skill_id"] : []),
    capability_id: "page-guidance", capability_version: 1, effect: "read", confirmation: "never" })),
  { name: "read_lua_files", description: "Read the current unsaved working copy.", input_schema: schema(), capability_id: "lua-editor", capability_version: 1, effect: "read", confirmation: "never" },
  { name: "edit_lua_file", description: "Edit one file in the unsaved working copy.", input_schema: schema({ file: { type: "string" }, expected_revision: { type: "integer" }, edits: { type: "array" }, content: { type: "string" } }, ["file", "expected_revision"]),
    capability_id: "lua-editor", capability_version: 1, effect: "view_mutation", confirmation: "never" },
  { name: "save_lua_files", description: "Save the browser working copy to main.", input_schema: schema({ expected_revision: { type: "integer" } }, ["expected_revision"]),
    capability_id: "lua-editor", capability_version: 1, effect: "view_mutation", confirmation: "never" },
  { name: "run_preview", description: "Replay the working copy against the Preview pane's instance.", input_schema: schema({ encounter_ids: { type: "array" } }), capability_id: "lua-editor", capability_version: 1, effect: "read", confirmation: "never" },
  { name: "control_preview_replay", description: "Drive Replay in the visible Preview pane.", input_schema: schema({ enabled: { type: "boolean" }, playing: { type: "boolean" }, position_ms: { type: "number" }, speed: { type: "number" } }),
    capability_id: "lua-editor", capability_version: 1, effect: "view_mutation", confirmation: "never" },
  { name: "run_startup_check", description: "Check Lua startup in a sandboxed worker.", input_schema: schema(), capability_id: "lua-editor", capability_version: 1, effect: "read", confirmation: "never" },
]

/** One scripted agent call. args sees the previous tool's result, e.g. to pass its revision. */
type AgentStep = { toolName: string; args: (last: Record<string, unknown>) => Record<string, unknown> }
type AgentOptions = { owner?: { id: string; name: string; version: string } | null; steps?: AgentStep[]; pauseMs?: number }

/** A protocol-3 chronicle-mcp daemon with one browser connection and an optional scripted agent. */
function fakeDaemon({ owner = null, steps = [], pauseMs = 1800 }: AgentOptions = {}) {
  let connection: { id: string; name: string; page: { url: string; generation: string; sessionId: string }; owner: AgentOptions["owner"]; ownershipRevision: number } | null = null
  let tools: Array<{ name: string; capability: unknown }> = []
  let pending: { id: string; toolName: string; arguments: unknown; generation: string; capability: unknown } | null = null
  let next = 0
  let readyAt = Infinity
  let last: Record<string, unknown> = {}
  const state = () => {
    if (connection && owner && !connection.owner) {
      connection = { ...connection, owner, ownershipRevision: connection.ownershipRevision + 1 }
    }
    if (connection?.owner && !pending && next < steps.length && Date.now() >= readyAt) {
      const step = steps[next++]
      const tool = tools.find(item => item.name === step.toolName)
      if (tool) pending = { id: `call-${next}`, toolName: step.toolName, arguments: step.args(last), generation: connection.page.generation, capability: tool.capability }
    }
    return { protocol: 3, connection, commands: pending ? [{ type: "tool", ownershipRevision: connection!.ownershipRevision, ...pending }] : [] }
  }
  return [
    http.get(`${LOCAL_MCP_ORIGIN}/healthz`, () => HttpResponse.json({ service: "chronicle", version: "0.2.1", protocol: 3 })),
    http.post(`${LOCAL_MCP_ORIGIN}/v1/connect`, async ({ request }) => {
      const body = await request.json() as { clientId: string }
      connection = null; next = 0; pending = null; last = {}
      readyAt = Date.now() + pauseMs
      return HttpResponse.json({ protocol: 3, clientId: body.clientId, token: "a".repeat(64) })
    }),
    http.post(`${LOCAL_MCP_ORIGIN}/v1/browser`, async ({ request }) => {
      const body = await request.json() as { clientId: string; page: { url: string; generation: string; sessionId: string }; tools: typeof tools; name: string; result?: { id: string; result: { result: Record<string, unknown> } } }
      tools = body.tools
      connection = { id: body.clientId, name: body.name, page: body.page, owner: connection?.owner ?? null, ownershipRevision: connection?.ownershipRevision ?? 0 }
      if (body.result && pending?.id === body.result.id) {
        last = body.result.result.result ?? {}
        pending = null
        readyAt = Date.now() + pauseMs
      }
      return HttpResponse.json({ ok: true, connection: state().connection, ...(body.result ? { resultAccepted: true } : {}) })
    }),
    http.get(`${LOCAL_MCP_ORIGIN}/v1/state`, () => HttpResponse.json(state())),
    http.post(`${LOCAL_MCP_ORIGIN}/v1/browser/revoke`, () => {
      if (connection) connection = { ...connection, owner: null, ownershipRevision: connection.ownershipRevision + 1 }
      owner = null; pending = null
      return HttpResponse.json({ ok: true, connection })
    }),
    http.post(`${LOCAL_MCP_ORIGIN}/v1/browser/disconnect`, () => { connection = null; return HttpResponse.json({ ok: true }) }),
  ]
}
const noDaemon = [http.all(`${LOCAL_MCP_ORIGIN}/*`, () => HttpResponse.error())]

/** The agent caps the meter at ten rows, previews it on Hakkar, then saves. */
const TOP_TEN: AgentStep[] = [
  { toolName: "read_lua_files", args: () => ({}) },
  { toolName: "edit_lua_file", args: last => ({ file: "main.lua", expected_revision: last.revision, edits: [
    { old_text: `panelTitle = "Damage Done"`, new_text: `panelTitle = "Damage Done · top 10"` },
    { old_text: "  chart:SetDuration(longest)", new_text: "  while #rows > 10 do table.remove(rows) end\n  chart:SetDuration(longest)" },
  ] }) },
  { toolName: "run_preview", args: () => ({ encounter_ids: [HAKKAR] }) },
]
const SAVE: AgentStep = { toolName: "save_lua_files", args: last => ({ expected_revision: last.revision }) }

function api({ current = project(), canRelease = true, draft = DRAFT_ZIP }: { current?: LuaProject; canRelease?: boolean; draft?: Uint8Array } = {}) {
  let revision = current.revision
  return [
    http.get("/api/v1/whoami", () => HttpResponse.json({ user_id: "user-1", session_id: "session-1", roles: [], ads_free: false })),
    http.get("/api/v1/site-config", () => HttpResponse.json({ signups_enabled: true, client_uploads_disabled: false, billing_enabled: false, ads_enabled: false, tenant: null })),
    http.get("/api/v1/modules/:author/:slug", () => HttpResponse.json({ project: { ...current, revision }, permissions: { view: true, use: true, edit: true, release: canRelease, manage: true } })),
    http.get("/api/v1/lua-projects/:id/page", () => HttpResponse.json({ project: { ...current, revision }, permissions: { view: true, use: true, edit: true, release: canRelease, manage: true } })),
    http.get("/api/v1/me/lua-projects/:id", () => HttpResponse.json({ ...current, revision })),
    http.get("/api/v1/me/lua-projects/:id/draft/:sha/package", () => new HttpResponse(draft, { headers: { "Content-Type": "application/zip" } })),
    http.put("/api/v1/me/lua-projects/:id/draft", async () => { await delay(400); revision += 1; return new HttpResponse(null, { status: 204 }) }),
    http.get("/api/v1/raidlogs/recent", () => HttpResponse.json(RECENT)),
    http.get("/api/v1/raidlogs/instances/:id", () => HttpResponse.json({ ...instanceFixture, realm_name: "Nordanaar", start_time: "2026-11-17T19:30:00Z" })),
    http.get("/api/v1/raidlogs/instances/:id/events/:stream", async ({ params }) => {
      const url = params.stream === "damage" ? damageFixture : params.stream === "heal" ? healFixture : null
      if (!url) return new HttpResponse(new Uint8Array(), { headers: { "Content-Type": "application/octet-stream" } })
      return new HttpResponse(await (await fetch(url)).arrayBuffer(), { headers: { "Content-Type": "application/octet-stream" } })
    }),
    http.get("/api/v1/inference/client-tools", () => HttpResponse.json({ tools: TOOLS })),
    http.post("/api/v1/inference/client-tools/validate", async ({ request }) => HttpResponse.json({ arguments: (await request.json() as { arguments: unknown }).arguments })),
    http.get("/api/v1/inference/client-tools/context", () => HttpResponse.json({ prompt: "You are editing a Chronicle module in the Module Workshop.", skills: [] })),
    http.get("/api/v1/inference/client-tools/skills", () => HttpResponse.json({ skills: [] })),
    // Browser chat: an OpenRouter connection and an existing workshop thread.
    http.post("/api/v1/authcheck", () => HttpResponse.json({ inferenceChat: true, inferenceDebug: false })),
    http.get("/api/v1/me/inference", () => HttpResponse.json({ available: true, disabled: false, enabled: true, service_available: true,
      assistants: [{ id: "module-workshop-panel", name: "Module Workshop", description: "", enabled: true, default_model: "anthropic/claude-sonnet-5-5" }],
      discord_linked: false, discord_enabled: false, discord_default_tenant: "" })),
    http.get("/api/v1/me/inference/connections", () => HttpResponse.json({ connections: [{ id: "conn-1", provider: "openrouter", auth_mode: "oauth", label: "OpenRouter", status: "active", created_at: "2026-10-01T00:00:00Z" }] })),
    http.get("/api/v1/inference/connections/:id/models", () => HttpResponse.json({ models: [{ id: "anthropic/claude-sonnet-5-5", name: "Claude Sonnet 5.5", context_length: 200_000 }] })),
    http.post("/api/v1/inference/threads/lua-project/:id", () => HttpResponse.json({
      thread: { id: "thread-1", assistant_id: "module-workshop-panel", persistence: "durable", context_type: "lua_project", context_id: PROJECT_ID, title: "Raid Damage Meter", created_at: "2026-11-18T00:00:00Z", updated_at: "2026-11-18T00:00:00Z" },
      messages: [
        { id: "m1", role: "user", content: "Rank players by damage with bars" },
        { id: "m2", role: "assistant", content: "Done. main.lua now totals damage per player and draws Chronicle's player meter on completion. I previewed it on Hakkar: 15 players, Jimmythehand on top at 918.6 DPS." },
      ],
      usage: { prompt_tokens: 18_200, completion_tokens: 1_400, cached_tokens: 12_000, reasoning_tokens: 0 },
    })),
  ]
}

type Setup = { usedBefore?: boolean; view?: "preview" | "code"; chatOpen?: boolean; selection?: boolean; frame?: { width: number; height: number } }
/** Per-viewer browser state the page reads on mount. Stories share one origin, so reset it every time. */
function seedBrowser({ usedBefore = false, view = "preview", chatOpen = false, selection = true, frame }: Setup) {
  localStorage.setItem("lua-workshop-layout-v2", JSON.stringify({ view, chatOpen, chatWidth: null, frame: frame ?? null }))
  localStorage.setItem("lua-workshop-auto-preview", "1")
  if (usedBefore) localStorage.setItem("chronicle-local-mcp-used", "1")
  else localStorage.removeItem("chronicle-local-mcp-used")
  sessionStorage.removeItem("chronicle-local-mcp-prompt-dismissed")
  if (selection) localStorage.setItem(`lua-workshop-preview:${PROJECT_ID}`, JSON.stringify({ instanceId: INSTANCE_ID, encounterIds: [HAKKAR] }))
  else localStorage.removeItem(`lua-workshop-preview:${PROJECT_ID}`)
}

/** Mirrors main.tsx and Layout: a data router around the inference runtime, the tab's local MCP connection and tooltips. */
function Workshop() {
  const router = useMemo(() => createMemoryRouter([{ path: "*", element: <InferenceRuntimeProvider><LocalMcpProvider><TooltipProvider>
    <Routes><Route path="/modules/:author/:slug/edit" element={<ModuleWorkspaceByPath />} /></Routes>
    <Toaster />
  </TooltipProvider></LocalMcpProvider></InferenceRuntimeProvider> }], { initialEntries: ["/modules/forgewright/raid-damage-meter/edit"] }), [])
  return <RouterProvider router={router} />
}

const meta = {
  title: "Pages/LuaProjects/ModuleWorkshop",
  component: Workshop,
  parameters: { layout: "fullscreen", msw: { handlers: [...api(), ...noDaemon] } },
  beforeEach: () => seedBrowser({}),
} satisfies Meta<typeof Workshop>
export default meta
type Story = StoryObj<typeof meta>

/** Clicks the header's Connect agent button, as a first-time user would. */
const connect: Story["play"] = async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "Connect agent" }, { timeout: 15_000 }))
}

/** First visit: no agent has ever connected, so nothing probes the local port. The agent bar explains MCP setup. */
export const NoAgentYet: Story = {}

/** chronicle-mcp is running and this browser has connected before: the page offers to connect on load. */
export const AutoConnectPrompt: Story = {
  beforeEach: () => seedBrowser({ usedBefore: true }),
  parameters: { msw: { handlers: [...api(), ...fakeDaemon()] } },
}

/** Connected, but no agent has selected this tab yet. */
export const WaitingForAgent: Story = {
  parameters: { msw: { handlers: [...api(), ...fakeDaemon()] } },
  play: connect,
}

/**
 * Vibe coding: the agent edits main.lua, previews Hakkar, then saves without asking. Watch the unsaved chip
 * appear after the edit, the preview re-run, and the chip clear after the save.
 */
export const AgentDriving: Story = {
  parameters: { msw: { handlers: [...api(), ...fakeDaemon({ owner: { id: "agent-claude", name: "Claude Code", version: "2.1.0" }, steps: [...TOP_TEN, SAVE] })] } },
  play: connect,
}

/** The agent edited and previewed but has not saved: the unsaved state is loud. */
export const AgentEditUnsaved: Story = {
  parameters: { msw: { handlers: [...api(), ...fakeDaemon({ owner: { id: "agent-claude", name: "Claude Code", version: "2.1.0" }, steps: TOP_TEN, pauseMs: 600 })] } },
  play: connect,
}

/** The preview held at a third-width panel's size (4×4 on the instance grid). Drag its edges to try other sizes. */
export const PreviewAtPanelSize: Story = {
  beforeEach: () => seedBrowser({ frame: { width: 456, height: 420 } }),
}

/** Code is an optional view of the same canvas. */
export const CodeView: Story = {
  beforeEach: () => seedBrowser({ view: "code" }),
}

/** Browser chat is the secondary mode: a drawer beside the preview. */
export const BrowserChat: Story = {
  beforeEach: () => seedBrowser({ chatOpen: true }),
}

/** The daemon is not running or rejects this origin. */
export const ConnectionFailed: Story = { play: connect }

/**
 * Replay in the preview: the module declares "replay": "incremental", so turning on Replay delivers Hakkar's
 * events only up to the playhead. Turn on Replay, then press play, scrub or step and watch the meter grow.
 */
export const ReplayPreview: Story = {
  parameters: { msw: { handlers: [...api({ draft: REPLAY_ZIP }), ...noDaemon] } },
}

/** The agent drives Replay: it turns Replay on at 1:30, then plays at 4× from 0:30. */
export const AgentDrivesReplay: Story = {
  parameters: { msw: { handlers: [...api({ draft: REPLAY_ZIP }), ...fakeDaemon({ owner: { id: "agent-claude", name: "Claude Code", version: "2.1.0" }, steps: [
    { toolName: "control_preview_replay", args: () => ({ enabled: true, position_ms: 90_000 }) },
    { toolName: "control_preview_replay", args: () => ({ position_ms: 30_000, speed: 4, playing: true }) },
  ], pauseMs: 4000 })] } },
  play: connect,
}

/** A new module with nothing saved and no preview instance chosen yet. */
export const NewModule: Story = {
  beforeEach: () => seedBrowser({ selection: false }),
  parameters: { msw: { handlers: [...api({ current: project({ main: undefined, releases: [], revision: 1 }) }), ...noDaemon] } },
}
