import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent } from "storybook/test"
import type { CareerContribution, CareerPlayerResponse, CareerSummary } from "@/api/typesGenerated"
import { CareerFrame, GuildCareerContent, PlayerCareerContent } from "./CareerCard"

// Illustrative server responses, not a calculator or production policy fixture.
// Totals are supplied independently: the browser never derives scores from rows.
const contribution = (overrides: Partial<CareerContribution>): CareerContribution => ({
  instance_name: "Naxxramas", difficulty_name: "Normal", max_players: 10,
  weight: 1, include_average: true, include_renown: true,
  mastery: 83.4, peak: 96.2, renown: 210, eligible_metric_kills: 15, eligible_renown_kills: 24,
  ...overrides,
})
const summary = (overrides: Partial<CareerSummary> = {}): CareerSummary => ({
  mastery: 86.25, peak: 95.8, renown: 780, chosen_metric: "dps",
  performance_status: "ready", computed_at: "2026-11-09T12:00:00Z", refresh_pending: false,
  contributions: [
    contribution({}),
    contribution({ max_players: 25, weight: 2, mastery: 89.1, peak: 95.4, renown: 330 }),
    contribution({ instance_name: "Trial of the Crusader", difficulty_name: "Heroic", max_players: 25, weight: 3, mastery: 87.2, peak: 96, renown: 180 }),
    contribution({ instance_name: "The Obsidian Sanctum", max_players: 25, weight: null, include_average: false, mastery: 0, peak: 0, renown: 60, eligible_metric_kills: 0, eligible_renown_kills: 6 }),
  ], ...overrides,
})
const player = (value: CareerSummary, status = "ready"): CareerPlayerResponse => ({
  status, pool_fingerprint: "illustrative-pool", issues: [],
  cohorts: [{ player_class: "PRIEST", player_spec: "Holy", player_sub_spec: "Healing", summary: value }],
})
const populated: CareerPlayerResponse = {
  ...player(summary()),
  cohorts: [
    { player_class: "PRIEST", player_spec: "Holy", player_sub_spec: "Damage", summary: summary() },
    { player_class: "PRIEST", player_spec: "Holy", player_sub_spec: "Healing", summary: summary({ chosen_metric: "hps", mastery: 91.3, peak: 98.4, renown: 480 }) },
  ],
}

const meta = {
  title: "Components/Career/Career Card",
  component: CareerFrame,
  parameters: { layout: "fullscreen", docs: { description: { component: "Illustrative persisted career responses. Exact subspecs have independent Renown. Expand Raid contributions to inspect exact variants and Renown-only exclusions; no client scoring formulas or network requests." } } },
  decorators: [(Story) => <div className="mx-auto max-w-5xl bg-background p-4 text-foreground sm:p-8"><p className="mb-3 text-xs text-muted-foreground">Illustrative career data · not live rankings</p><Story /></div>],
  args: { loading: false, error: false, children: null },
} satisfies Meta<typeof CareerFrame>
export default meta
type Story = StoryObj<typeof meta>

export const ExactSubspecPlayer: Story = {
  args: { children: <PlayerCareerContent data={populated} /> },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("PRIEST · Holy · Damage")).toBeInTheDocument()
    await expect(canvas.getByText("PRIEST · Holy · Healing")).toBeInTheDocument()
    await expect(canvas.getByText("Stored performance metric: HPS")).toBeInTheDocument()
    for (const disclosure of canvas.getAllByText("Raid contributions (4)")) await fireEvent.click(disclosure)
    await expect(canvas.getAllByText("Excluded from average")).toHaveLength(2)
    await expect(canvas.getAllByText("Naxxramas · Normal · 10 players")).toHaveLength(2)
    await expect(canvas.getAllByText("Naxxramas · Normal · 25 players")).toHaveLength(2)
    await expect(canvas.getAllByText("Trial of the Crusader · Heroic · 25 players")).toHaveLength(2)
  },
}
export const GuildKillTime: Story = {
  args: { children: <GuildCareerContent data={{ status: "ready", pool_fingerprint: "illustrative-pool", issues: [], summary: summary({ chosen_metric: null }) }} /> },
}
export const Loading: Story = { args: { loading: true } }
export const LoadError: Story = { args: { error: true } }
export const RefreshErrorWithPreviousResults: Story = { args: { error: true, children: <PlayerCareerContent data={populated} /> } }
export const Preparing: Story = {
  args: { children: <PlayerCareerContent data={player(summary({ mastery: null, peak: null, renown: 0, chosen_metric: null, computed_at: null, performance_status: "preparing", contributions: [] }), "preparing")} /> },
}
export const MissingWeightsWithRenown: Story = {
  args: { children: <PlayerCareerContent data={{ ...player(summary({ mastery: null, peak: null, performance_status: "weights_pending", contributions: [contribution({ weight: null, mastery: null, peak: null })] })), issues: [{ instance_name: "Naxxramas", difficulty_name: "Normal", max_players: 10, code: "missing_weight" }] }} /> },
}
export const RefreshPending: Story = { args: { children: <PlayerCareerContent data={player(summary({ refresh_pending: true }))} /> } }
export const Empty: Story = { args: { children: <PlayerCareerContent data={{ status: "ready", cohorts: [], pool_fingerprint: "illustrative-pool", issues: [] }} /> } }
export const NoEvidence: Story = {
  args: { children: <PlayerCareerContent data={player(summary({ mastery: null, peak: null, renown: 0, chosen_metric: null, computed_at: null, performance_status: "no_evidence", contributions: [] }), "no_evidence")} /> },
}
