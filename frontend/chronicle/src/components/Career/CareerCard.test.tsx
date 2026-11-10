import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { CareerSummary } from "@/api/typesGenerated"
import { CareerFrame, CareerSummaryView, PlayerCareerContent, GuildCareerContent } from "./CareerCard"
const summary: CareerSummary = { mastery: null, peak: 0, renown: 42, chosen_metric: "hps", performance_status: "weights_pending", computed_at: null, refresh_pending: true,
  contributions: [{ instance_name: "Raid", difficulty_name: "Heroic", max_players: 25, weight: null, include_average: false, include_renown: true, mastery: 0, peak: 0, renown: 42, eligible_metric_kills: 0, eligible_renown_kills: 7 }] }
describe("career components", () => {
  it("distinguishes missing weights and null from zero without hiding Renown or overriding HPS", () => {
    const html = renderToStaticMarkup(<CareerSummaryView summary={summary} />)
    expect(html).toContain("weights are not configured")
    expect(html).toContain("Stored performance metric: HPS")
    expect(html).toContain(">—</dd>")
    expect(html).toContain(">0</dd>")
    expect(html).toContain(">42</dd>")
    expect(html).toContain("Refresh pending")
    expect(html).toContain("Excluded from average")
    expect(html).toContain("Raid · Heroic · 25 players")
  })
  it("keeps exact subspec identities and their independent Renown", () => {
    const html = renderToStaticMarkup(<PlayerCareerContent data={{ status: "ready", pool_fingerprint: "p", issues: [], cohorts: ["Support", "Healing"].map(player_sub_spec => ({ player_class: "PRIEST", player_spec: "Holy", player_sub_spec, summary })) }} />)
    expect(html).toContain("PRIEST · Holy · Support")
    expect(html).toContain("PRIEST · Holy · Healing")
    expect(html).not.toContain("84")
  })
  it("keeps exact raid variants and excludes average values for Renown-only contributions", () => {
    const html = renderToStaticMarkup(<CareerSummaryView summary={{ ...summary, contributions: [summary.contributions[0], { ...summary.contributions[0], difficulty_name: "Normal", max_players: 40 }] }} />)
    expect(html).toContain("Heroic · 25 players")
    expect(html).toContain("Normal · 40 players")
    expect(html).toContain("Excluded from average")
  })
  it("shows guild kill-time basis without DPS/HPS controls", () => {
    const html = renderToStaticMarkup(<GuildCareerContent data={{ status: "ready", pool_fingerprint: "p", issues: [], summary: { ...summary, chosen_metric: null } }} />)
    expect(html).toContain("Kill-time performance")
    expect(html).not.toContain("DPS")
    expect(html).not.toContain("HPS")
    expect(html).not.toContain("<button")
  })
  it("handles empty and unknown states without inventing scores or metric", () => {
    const html = renderToStaticMarkup(<PlayerCareerContent data={{ status: "new_status", cohorts: [], issues: [], pool_fingerprint: "p" }} />)
    expect(html).toContain("not available yet")
    expect(renderToStaticMarkup(<CareerSummaryView summary={{ ...summary, chosen_metric: null, performance_status: "preparing" }} />)).toContain("metric not selected yet")
    expect(renderToStaticMarkup(<PlayerCareerContent data={{ status: "ready", cohorts: [], issues: [], pool_fingerprint: "p" }} />)).toContain("No eligible career specializations")
  })
})

it("keeps loading and errors distinct from empty published scores", () => {
  expect(renderToStaticMarkup(<CareerFrame loading error={false}>{null}</CareerFrame>)).toContain("Loading career scores")
  const failed = renderToStaticMarkup(<CareerFrame loading={false} error><p>Previous results</p></CareerFrame>)
  expect(failed).toContain("could not be refreshed")
  expect(failed).toContain("Previous results")
  expect(failed).not.toContain("No eligible")
})
