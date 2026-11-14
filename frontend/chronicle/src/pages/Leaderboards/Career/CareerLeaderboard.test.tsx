import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { CareerLeaderboard } from "./CareerLeaderboard"

describe("CareerLeaderboard", () => {
  it("shows subspec filters for a selected split spec", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CareerLeaderboard
            view="peak"
            onView={vi.fn()}
            filters={{ subject: "characters", role: "all", scope: { cls: "DRUID", spec: "Feral" }, raids: [] }}
            subSpecs={["Bear", "Cat"]}
            onFilters={vi.fn()}
            realm="All realms"
            realms={["All realms"]}
            onRealm={vi.fn()}
            state={{ status: "loading" }}
            request={new URLSearchParams()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('aria-label="Feral subspec"')
    expect(html).toContain(">Bear</button>")
    expect(html).toContain(">Cat</button>")
  })
})
