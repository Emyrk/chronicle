import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ReactElement } from "react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { LuaProjectsPage } from "./LuaProjectsPage"
import { NewAddonForm } from "./NewAddonForm"
import { AddonDescription } from "./AddonDescription"
import type { LuaProject } from "./api"

vi.mock("@/api/queries", () => ({ useAuthorizationCheck: vi.fn(), useSession: vi.fn() }))
vi.mock("@/components/Ads/AdRailStack", () => ({ AdRailStack: ({ primaryPlacement }: { primaryPlacement: string }) => <aside data-ad={primaryPlacement} /> }))

function render(element: ReactElement, client = new QueryClient()) {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>)
}

function addon(name: string, stars: number, publishedAt: string): LuaProject {
  return { id: name, owner_id: "o", kind: "panel", name, slug: name, revision: 1, description: `${name} does things.`, author: "someone", stars, starred: false, created_at: publishedAt, updated_at: publishedAt,
    releases: [{ tag: "v1", available: true, sha256: "x", published_at: publishedAt }] }
}

describe("addons home", () => {
  it("welcomes anonymous visitors, asks them to sign in, and lists released addons", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isLoading: false } as ReturnType<typeof useSession>)
    const html = render(<LuaProjectsPage />)
    expect(html).toContain("Welcome! Make your first addon")
    expect(html).toContain("Sign in to get started.")
    expect(html).toContain("Browse addons")
    expect(html).not.toContain("My addons")
  })

  it("shows released addons as a gallery in the server's most-tracked order", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isLoading: false } as ReturnType<typeof useSession>)
    const client = new QueryClient()
    client.setQueryData(["public-addons"], [addon("Big Pumper", 42, "2026-01-01T00:00:00Z"), addon("Fresh Panel", 1, "2026-10-01T00:00:00Z")])
    const html = render(<LuaProjectsPage />, client)
    expect(html.indexOf("Big Pumper")).toBeLessThan(html.indexOf("Fresh Panel"))
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain(">Popular</button>")
    expect(html).toContain("42 people track this addon")
    expect(html).toContain("<table")
    expect(html, "descriptions show under the name").toContain("Big Pumper does things.")
    expect(html).toContain('data-ad="addons-left-rail"')
    expect(html).toContain('data-ad="addons-right-rail"')
    expect(html, "popular order is ranked").toMatch(/<td[^>]*>1<\/td>/)
  })
})

describe("new addon form", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ data: { user_id: "me" }, isLoading: false } as ReturnType<typeof useSession>)
  })

  it("explains a denied permission instead of showing the form", () => {
    vi.mocked(useAuthorizationCheck).mockReturnValue({ data: { createLuaProject: false }, isPending: false } as unknown as ReturnType<typeof useAuthorizationCheck>)
    const html = render(<NewAddonForm author="steven" />)
    expect(html).toContain("You do not have permission to create addons")
    expect(html).not.toContain("New addon</h2>")
    expect(useAuthorizationCheck).toHaveBeenCalledWith({ createLuaProject: "chronicle:chronicle#create_lua_project" }, { enabled: true })
  })

  it("lets authors pick the address", () => {
    vi.mocked(useAuthorizationCheck).mockReturnValue({ data: { createLuaProject: true }, isPending: false } as unknown as ReturnType<typeof useAuthorizationCheck>)
    const html = render(<NewAddonForm author="steven" />)
    expect(html).toContain("Create addon</button>")
    expect(html).toContain('aria-label="Slug"')
    expect(html, "guides are not offered as a new kind").not.toContain("Guide")
  })

  it("asks only for a name for a first addon", () => {
    vi.mocked(useAuthorizationCheck).mockReturnValue({ data: { createLuaProject: true }, isPending: false } as unknown as ReturnType<typeof useAuthorizationCheck>)
    const html = render(<NewAddonForm author="steven" first />)
    expect(html).toContain("Create and open the Workshop")
    expect(html).not.toContain('aria-label="Slug"')
  })
})

describe("addon description", () => {
  const empty = { ...addon("Quiet", 0, "2026-01-01T00:00:00Z"), description: "" }
  it("invites people who may release to add one", () => {
    expect(render(<AddonDescription project={empty} canEdit onSaved={() => {}} />)).toContain("Add a description")
  })
  it("hides an empty description from everyone else, and shows a set one", () => {
    expect(render(<AddonDescription project={empty} canEdit={false} onSaved={() => {}} />)).toBe("")
    const html = render(<AddonDescription project={addon("Loud", 0, "2026-01-01T00:00:00Z")} canEdit={false} onSaved={() => {}} />)
    expect(html).toContain("Loud does things.")
    expect(html).not.toContain("Edit")
  })
})
