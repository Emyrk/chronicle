import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExplorerAuthentication } from "./ExplorerAuthentication"

const auth = vi.hoisted(() => ({ signedIn: false }))
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: auth.signedIn ? { user_id: "explorer-user" } : null,
    isAuthenticated: auth.signedIn,
  }),
}))

afterEach(() => { auth.signedIn = false })

function render(signedIn: boolean) {
  auth.signedIn = signedIn
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(["developer-app", "explorer-user"], {
    id: "app-id", client_id: "chronicle-app-autofilled", name: "My app",
  })
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <ExplorerAuthentication connected={false} onConnect={() => {}} sessionRef={{ current: null }} />
    </QueryClientProvider>,
  )
}

describe("explorer client ID prefill", () => {
  it("prefills the signed-in user's client ID without filling a secret", () => {
    const html = render(true)
    expect(html).toContain('value="chronicle-app-autofilled"')
    expect(html).toContain('name="client_secret"')
    expect(html).not.toContain('readonly')
    expect(html).not.toContain('readOnly')
  })

  it("keeps the client ID empty for signed-out visitors", () => {
    const html = render(false)
    expect(html).not.toContain("chronicle-app-autofilled")
    expect(html).toContain('name="client_id"')
  })
})
