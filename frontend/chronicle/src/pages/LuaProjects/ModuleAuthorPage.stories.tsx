import type { Meta, StoryObj } from "@storybook/react-vite"
import { http, HttpResponse, delay } from "msw"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { LuaProject } from "./api"
import { ModuleAuthorPage } from "./ModuleAuthorPage"

function panel(overrides: Partial<LuaProject> = {}): LuaProject {
  return {
    id: overrides.id ?? "panel-1", owner_id: "owner-1", kind: "panel", name: "Ember Threat Tracker", slug: "ember-threat-tracker",
    revision: 3, description: "A live threat meter with a dedicated taunt warning for tanks.", author: "chronicle",
    stars: 128, starred: true, created_at: "2026-06-01T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
    releases: [{ tag: "v2.1", available: true, sha256: "a1", published_at: "2026-09-10T00:00:00Z" }],
    ...overrides,
  }
}

const MY_PROJECTS: LuaProject[] = [
  panel({ id: "p1", name: "Ember Threat Tracker", stars: 412 }),
  panel({ id: "p2", kind: "guide", name: "Raid Cooldown Planner", slug: "raid-cooldown-planner", stars: 201, starred: false,
    description: "Plans external cooldowns across a roster encounter by encounter.",
    releases: [{ tag: "v4", available: true, sha256: "a2", published_at: "2026-10-20T00:00:00Z" }] }),
  panel({ id: "p3", name: "Unreleased Draft", slug: "unreleased-draft", stars: 3, starred: false, description: "Work in progress, nothing tagged yet.", releases: [] }),
]

const SHARED_PROJECTS: LuaProject[] = [
  panel({ id: "s1", owner_id: "owner-2", name: "Consumable Checklist", slug: "consumable-checklist", stars: 87, starred: false, author: "brewmaster",
    description: "Flags anyone missing flasks, food, or runes before a pull." }),
]

function handlers({ routeAuthor = "chronicle", viewerIsAuthor = true, authorPageAuthor = routeAuthor, projects = MY_PROJECTS, shared = [] as LuaProject[], pageLoading = false }:
  { routeAuthor?: string; viewerIsAuthor?: boolean; authorPageAuthor?: string; projects?: LuaProject[]; shared?: LuaProject[]; pageLoading?: boolean } = {}) {
  return [
    http.get("/api/v1/site-config", () => HttpResponse.json({ signups_enabled: true, client_uploads_disabled: false, billing_enabled: false, ads_enabled: false, tenant: null })),
    http.get("/api/v1/whoami", () => HttpResponse.json({ user_id: "user-1", session_id: "session-1", roles: [], ads_free: false })),
    http.get("/api/v1/me/module-author", () => HttpResponse.json({ name: viewerIsAuthor ? routeAuthor : "someone-else" })),
    http.get("/api/v1/me/lua-projects", () => HttpResponse.json([...projects, ...shared])),
    http.get("/api/v1/modules/:author", async () => {
      if (pageLoading) await delay("infinite")
      return HttpResponse.json({ author: authorPageAuthor, projects })
    }),
  ]
}

const meta = {
  title: "Pages/LuaProjects/ModuleAuthorPage",
  component: ModuleAuthorPage,
  parameters: { layout: "fullscreen", msw: { handlers: handlers() }, path: "/modules/chronicle" },
  decorators: [(Story, context) => <MemoryRouter initialEntries={[context.parameters.path as string]}><Routes><Route path="/modules/:author" element={<Story />} /></Routes></MemoryRouter>],
} satisfies Meta<typeof ModuleAuthorPage>

export default meta
type Story = StoryObj<typeof meta>

/** Your own module page: a "New module" button in the header, your modules listed with a colored dot per kind. */
export const YourModules: Story = {
  parameters: { msw: { handlers: handlers({ projects: MY_PROJECTS }) } },
}

/** With a module someone else shared edit or release access to. */
export const WithSharedModules: Story = {
  parameters: { msw: { handlers: handlers({ projects: MY_PROJECTS, shared: SHARED_PROJECTS }) } },
}

/** No modules yet: an invite to create the first one. */
export const EmptyYourModules: Story = {
  parameters: { msw: { handlers: handlers({ projects: [] }) } },
}

/** Someone else's author page: read-only, no create button. */
export const SomeoneElsesModules: Story = {
  parameters: {
    path: "/modules/duskhollow",
    msw: { handlers: handlers({ routeAuthor: "duskhollow", viewerIsAuthor: false, authorPageAuthor: "duskhollow", projects: MY_PROJECTS.map(p => ({ ...p, author: "duskhollow" })) }) },
  },
}

/** While the author's modules are loading. */
export const Loading: Story = {
  parameters: { msw: { handlers: handlers({ pageLoading: true }) } },
}
