import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { LuaProjectsPage } from "./LuaProjectsPage"

vi.mock("@/api/queries", () => ({ useAuthorizationCheck: vi.fn(), useSession: vi.fn() }))

function renderPage() {
  return renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><LuaProjectsPage /></MemoryRouter></QueryClientProvider>)
}

describe("addon creation permission", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ data: { user_id: "me" }, isLoading: false } as ReturnType<typeof useSession>)
  })

  it("hides the create form and explains a denied permission", () => {
    vi.mocked(useAuthorizationCheck).mockReturnValue({ data: { createLuaProject: false }, isPending: false } as unknown as ReturnType<typeof useAuthorizationCheck>)
    const html = renderPage()
    expect(html).toContain("You do not have permission to create addons")
    expect(html).not.toContain("New addon</h2>")
    expect(useAuthorizationCheck).toHaveBeenCalledWith({ createLuaProject: "chronicle:chronicle#create_lua_project" }, { enabled: true })
  })

  it("welcomes anonymous visitors and asks them to sign in without checking a permission", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isLoading: false } as ReturnType<typeof useSession>)
    vi.mocked(useAuthorizationCheck).mockReturnValue({ isPending: true } as unknown as ReturnType<typeof useAuthorizationCheck>)
    const html = renderPage()
    expect(html).toContain("Make your first addon")
    expect(html).toContain("Sign in to get started.")
    expect(html).not.toContain("New addon</h2>")
    expect(useAuthorizationCheck).toHaveBeenCalledWith({ createLuaProject: "chronicle:chronicle#create_lua_project" }, { enabled: false })
  })

  it("shows the create form to an authorized user", () => {
    vi.mocked(useAuthorizationCheck).mockReturnValue({ data: { createLuaProject: true }, isPending: false } as unknown as ReturnType<typeof useAuthorizationCheck>)
    expect(renderPage()).toContain("Create addon</button>")
  })
})
