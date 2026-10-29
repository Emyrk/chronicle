import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ReactElement } from "react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { NewModulePage } from "./NewModulePage"

vi.mock("@/api/queries", () => ({ useAuthorizationCheck: vi.fn(), useSession: vi.fn() }))

function render(element: ReactElement, author: string | null = "steven", owned = 0) {
  const client = new QueryClient()
  client.setQueryData(["module-author", "me"], author)
  client.setQueryData(["module-project-quota", "me"], { owned, limit: 3 })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>)
}

describe("new module page", () => {
  it("redirects back to /modules before an author name is claimed", () => {
    vi.mocked(useSession).mockReturnValue({ data: { user_id: "me" }, isLoading: false } as ReturnType<typeof useSession>)
    vi.mocked(useAuthorizationCheck).mockReturnValue({ data: { createLuaProject: true }, isPending: false } as unknown as ReturnType<typeof useAuthorizationCheck>)
    expect(render(<NewModulePage />, null)).toBe("")
  })

  it("explains a denied permission instead of showing the form", () => {
    vi.mocked(useSession).mockReturnValue({ data: { user_id: "me" }, isLoading: false } as ReturnType<typeof useSession>)
    vi.mocked(useAuthorizationCheck).mockReturnValue({ data: { createLuaProject: false }, isPending: false } as unknown as ReturnType<typeof useAuthorizationCheck>)
    const html = render(<NewModulePage />)
    expect(html).toContain("You do not have permission to create modules")
    expect(html).not.toContain("Create module</button>")
  })

  it("blocks creation at the resource limit", () => {
    vi.mocked(useSession).mockReturnValue({ data: { user_id: "me" }, isLoading: false } as ReturnType<typeof useSession>)
    vi.mocked(useAuthorizationCheck).mockReturnValue({ data: { createLuaProject: true }, isPending: false } as unknown as ReturnType<typeof useAuthorizationCheck>)
    const html = render(<NewModulePage />, "steven", 3)
    expect(html).toContain("You own 3 of 3 modules")
    expect(html).toContain("shared storage and processing resources")
    expect(html).not.toContain("Create module</button>")
  })

  it("lets an author pick a name and an optional description, with the address and type following along", () => {
    vi.mocked(useSession).mockReturnValue({ data: { user_id: "me" }, isLoading: false } as ReturnType<typeof useSession>)
    vi.mocked(useAuthorizationCheck).mockReturnValue({ data: { createLuaProject: true }, isPending: false } as unknown as ReturnType<typeof useAuthorizationCheck>)
    const html = render(<NewModulePage />)
    expect(html).toContain("/modules/steven/")
    expect(html, "the address is read-only, derived from the name").toContain('readOnly="" aria-label="Address"')
    expect(html, "the type is hardcoded to Instance panel and disabled").toContain('<option value="panel" selected="">Instance panel</option>')
    expect(html).toContain('disabled="" aria-label="Type"')
    expect(html).toContain("Description")
    expect(html).toContain("Create module</button>")
    expect(html, "guides are not offered as a new kind").not.toContain("Guide")
  })
})
