import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ReactElement } from "react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { LuaProjectsPage } from "./LuaProjectsPage"
import { NewAddonForm } from "./NewAddonForm"

vi.mock("@/api/queries", () => ({ useAuthorizationCheck: vi.fn(), useSession: vi.fn() }))

function render(element: ReactElement) {
  return renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>)
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
