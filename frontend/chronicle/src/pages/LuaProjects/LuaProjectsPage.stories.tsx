import type { Meta, StoryObj } from "@storybook/react-vite"
import { http, HttpResponse, delay } from "msw"
import { MemoryRouter } from "react-router-dom"
import type { LuaProject } from "./api"
import { LuaProjectsPage } from "./LuaProjectsPage"

function panel(overrides: Partial<LuaProject> = {}): LuaProject {
  return {
    id: overrides.id ?? "panel-1", owner_id: "owner-1", kind: "panel", name: "Ember Threat Tracker", slug: "ember-threat-tracker",
    revision: 3, description: "A live threat meter with a dedicated taunt warning for tanks.", author: "forgewright",
    stars: 128, starred: false, created_at: "2026-06-01T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
    releases: [{ tag: "v2.1", available: true, sha256: "a1", published_at: "2026-09-10T00:00:00Z" }],
    ...overrides,
  }
}

const PUBLIC_PROJECTS: LuaProject[] = [
  panel({ id: "p1", name: "Ember Threat Tracker", author: "forgewright", stars: 412, description: "A live threat meter with a dedicated taunt warning for tanks." }),
  panel({ id: "p2", kind: "guide", name: "Raid Cooldown Planner", slug: "raid-cooldown-planner", author: "duskhollow", stars: 201,
    description: "Plans external cooldowns across a roster encounter by encounter.",
    releases: [{ tag: "v4", available: true, sha256: "a2", published_at: "2026-10-20T00:00:00Z" }] }),
  panel({ id: "p3", name: "Consumable Checklist", slug: "consumable-checklist", author: "brewmaster", stars: 87,
    description: "Flags anyone missing flasks, food, or runes before a pull.",
    releases: [{ tag: "v1.4", available: true, sha256: "a3", published_at: "2026-08-02T00:00:00Z" }] }),
  panel({ id: "p4", name: "Positioning Overlay", slug: "positioning-overlay", author: "forgewright", stars: 54, description: "",
    releases: [{ tag: "v1", available: true, sha256: "a4", published_at: "2026-10-27T00:00:00Z" }] }),
  panel({ id: "p5", name: "Unreleased Draft", slug: "unreleased-draft", author: "duskhollow", stars: 3, description: "Work in progress, nothing tagged yet.", releases: [] }),
]

function handlers({ signedIn = false, author = null, myProjects = [], publicProjects = PUBLIC_PROJECTS, permission = true, publicLoading = false }:
  { signedIn?: boolean; author?: string | null; myProjects?: LuaProject[]; publicProjects?: LuaProject[]; permission?: boolean; publicLoading?: boolean } = {}) {
  return [
    http.get("/api/v1/site-config", () => HttpResponse.json({ signups_enabled: true, client_uploads_disabled: false, billing_enabled: false, ads_enabled: false, tenant: null })),
    http.get("/api/v1/whoami", () => signedIn ? HttpResponse.json({ user_id: "user-1", session_id: "session-1", roles: [], ads_free: false }) : new HttpResponse(null, { status: 204 })),
    http.post("/api/v1/authcheck", () => HttpResponse.json({ createLuaProject: permission })),
    http.get("/api/v1/me/module-author", () => author ? HttpResponse.json({ name: author }) : new HttpResponse(null, { status: 204 })),
    http.get("/api/v1/me/module-author/suggestion", () => HttpResponse.json({ name: "my-name" })),
    http.get("/api/v1/me/lua-projects", () => HttpResponse.json(myProjects)),
    http.get("/api/v1/lua-projects", async () => {
      if (publicLoading) await delay("infinite")
      return HttpResponse.json(publicProjects)
    }),
  ]
}

const meta = {
  title: "Pages/LuaProjects/LuaProjectsPage",
  component: LuaProjectsPage,
  parameters: { layout: "fullscreen", msw: { handlers: handlers() } },
  decorators: [(Story) => <MemoryRouter initialEntries={["/modules"]}><Story /></MemoryRouter>],
} satisfies Meta<typeof LuaProjectsPage>

export default meta
type Story = StoryObj<typeof meta>

/** Signed out: the sign-in prompt sits above the public gallery, which anyone can browse. */
export const SignedOut: Story = {
  parameters: { msw: { handlers: handlers({ signedIn: false }) } },
}

/** A new author with zero modules still sees the three-step welcome, now on step 2: name a module. */
export const WelcomeNameYourModule: Story = {
  parameters: { msw: { handlers: handlers({ signedIn: true, author: "chronicle", myProjects: [], permission: true }) } },
}

/** A signed-in author who already has modules: the welcome is gone, "My modules" appears, and the gallery is ranked by popularity. */
export const SignedInWithModules: Story = {
  parameters: { msw: { handlers: handlers({ signedIn: true, author: "chronicle", myProjects: [panel({ id: "mine-1" })], permission: true }) } },
}

/** Nothing has been released yet. */
export const EmptyGallery: Story = {
  parameters: { msw: { handlers: handlers({ signedIn: true, author: "chronicle", myProjects: [panel({ id: "mine-1" })], publicProjects: [] }) } },
}

/** The gallery while /api/v1/lua-projects is still loading. */
export const Loading: Story = {
  parameters: { msw: { handlers: handlers({ signedIn: true, author: "chronicle", myProjects: [panel({ id: "mine-1" })], publicLoading: true }) } },
}
