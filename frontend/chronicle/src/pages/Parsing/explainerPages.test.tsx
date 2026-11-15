import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { RatingsPage } from "../Ratings/RatingsPage"
import { ParsingPage } from "./ParsingPage"

// These pages are crawlable and quoted by search engines and AI assistants. Each fact is
// checked against the scoring and ratings code; the PR that last edited them lists the
// references. Keep the wording in step with the /blog/parses-and-ratings-explained post.

function render(page: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  ).replace(/&#x27;|&#39;|&apos;/g, "'").replace(/<!-- -->/g, "")
}

describe("/parsing", () => {
  const html = render(<ParsingPage />)
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

  it("describes a rank-based score over the 60 days before the raid", () => {
    expect(text).toContain("60 days before your raid started")
    expect(text).toContain("Your own raid is never part of its own cohort")
    expect(text).toContain("rank position")
    expect(text).toContain("A Rank, Not a Percentage of the Best")
    expect(text).toContain("at least 5 comparable kills")
    expect(text).toContain("low confidence")
  })

  it("says stored parses are worked out once and stay the same", () => {
    expect(text).toContain("worked out once")
    expect(text).toContain("stays the same")
    expect(text).not.toContain("not permanently frozen")
    expect(text).not.toContain("can therefore change an older raid")
  })

  it("no longer claims interpolation by value, or a current mode", () => {
    expect(text).not.toContain("Value-based interpolation")
    expect(text).not.toContain("Why Not a Strict Rank-Based Percentile")
    expect(text).not.toContain("last place would score near 0")
    expect(text).not.toContain('"current" comparison mode')
  })

  it("states the eligibility rules the code applies", () => {
    expect(text).toContain("including kills where some adds were still alive")
    expect(text).toContain("the copy that covers the most bosses is used")
    expect(text).toContain("Unlisted logs are not scored")
  })
})

describe("/ratings", () => {
  const html = render(<RatingsPage />)
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

  it("no longer says Renown only goes up", () => {
    expect(text).not.toContain("It only goes up")
    expect(text).toContain("can drop if a log is removed or awards change")
    expect(text).toContain("Renown can go down as well")
  })

  it("says only bosses on the Renown list earn Renown", () => {
    expect(text).toContain("Only bosses on the Renown list earn Renown")
    expect(text).not.toContain("Every boss has a Renown award")
  })

  it("limits HPS to healing specs, matching spec-mode scoring", () => {
    expect(text).toContain("Healing specs")
    expect(text).toContain("Every other spec always counts as DPS")
    expect(text).not.toContain("If a Shadow Priest heals more than they damage on one fight, that kill is rated as HPS")
  })

  it("says only clean kills count for ratings", () => {
    expect(text).toContain("A kill with adds still alive counts for parses but not for ratings")
  })
})
