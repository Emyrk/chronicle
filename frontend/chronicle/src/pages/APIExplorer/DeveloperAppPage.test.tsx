import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DeveloperAppPage } from "./DeveloperAppPage"

const auth = vi.hoisted(() => ({ signedIn: false }))
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: auth.signedIn ? { user_id: "user-1" } : null,
    isAuthenticated: auth.signedIn,
    isLoading: false,
  }),
}))

afterEach(() => { auth.signedIn = false })

function render(app?: { id: string; client_id: string; name: string }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (app) queryClient.setQueryData(["developer-app", "user-1"], app)
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><DeveloperAppPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("DeveloperAppPage", () => {
  it("offers a sign-in link without requesting credentials for anonymous visitors", () => {
    const html = render()
    expect(html).toContain("Sign in to get started")
    expect(html).toContain("/login?from=%2Fdevelopers%2Fapi%2Fapp")
    expect(html).not.toContain("client-secret")
  })

  it("displays existing app metadata and credential actions", () => {
    auth.signedIn = true
    const html = render({ id: "app-1", client_id: "chronicle-app-1", name: "Raid bot" })
    expect(html).toContain("Raid bot")
    expect(html).toContain("chronicle-app-1")
    expect(html).toContain("Rotate secret")
    expect(html).toContain("Delete app")
    expect(html).not.toContain("data-testid=\"client-secret\"")
  })
})
