import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { RatingLeaderboard } from "./RatingLeaderboard"

const meta = {
  title: "Pages/Leaderboards/Ratings",
  component: RatingLeaderboard,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RatingLeaderboard>

export default meta
type Story = StoryObj<typeof meta>

/** Raid overview: Peak, Ranked Mastery, and Renown side by side; each boss shows its three leaders. */
export const RaidOverview: Story = {}

/** Raid view: Molten Core Peak in the center, per-boss boards around it. */
export const RaidPeak: Story = { args: { initialView: "peak" } }

export const RaidRankedMastery: Story = { args: { initialView: "mastery" } }

export const RaidRenown: Story = { args: { initialView: "renown" } }

/** Boss overview: Ragnaros in the center, each class's three leaders around it. */
export const BossOverview: Story = { args: { initialScope: { boss: "Ragnaros" } } }

/** Boss view: Ragnaros in the center, best per class around it. */
export const BossPeak: Story = { args: { initialScope: { boss: "Ragnaros" }, initialView: "peak" } }

/** Class view: Ragnaros warriors in the center, one board per spec around it. */
export const ClassPeak: Story = { args: { initialScope: { boss: "Ragnaros", cls: "WARRIOR" }, initialView: "peak" } }

/** Spec scope: no smaller boards to show, so the page is the full table. */
export const SpecPage: Story = { args: { initialScope: { boss: "Ragnaros", cls: "WARRIOR", spec: "Fury" }, initialView: "mastery" } }

/** Click boards to narrow raid → boss → class → spec; the pickers always show where you are. */
export const DrillDown: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const tabs = within(canvas.getByRole("navigation", { name: "Rating metric" }))
    await expect(tabs.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(tabs.getByRole("button", { name: "Peak" }))
    await userEvent.click(within(canvas.getByRole("region", { name: "Ragnaros Peak leaderboard" })).getByRole("button", { name: /Ragnaros/ }))
    await expect(canvas.getByRole("button", { name: "Boss: Ragnaros" })).toBeInTheDocument()
    await userEvent.click(within(canvas.getByRole("region", { name: "Warrior Peak leaderboard" })).getByRole("button", { name: /Warrior/ }))
    await userEvent.click(within(canvas.getByRole("region", { name: "Fury Peak leaderboard" })).getByRole("button", { name: /Fury/ }))
    await expect(canvas.getByRole("heading", { level: 1, name: "Fury Warrior" })).toBeInTheDocument()
    await expect(canvas.getByRole("region", { name: "Fury Warrior Peak full list" })).toBeInTheDocument()

    // Widen again from the picker bar.
    await userEvent.click(await canvas.findByRole("button", { name: "Class: Warrior" }))
    await userEvent.click(await body.findByRole("menuitemradio", { name: /All classes/ }), { delay: 100 })
    await expect(await canvas.findByRole("heading", { level: 1, name: "Ragnaros" })).toBeInTheDocument()
    await expect(await canvas.findByRole("button", { name: "Spec: Pick a class first" })).toBeDisabled()
  },
}

/** Pickers jump anywhere directly, e.g. straight to raid-wide Fury warriors. */
export const PickerJump: Story = {
  args: { initialView: "peak" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByRole("button", { name: "Class: All classes" }))
    await userEvent.click(await body.findByRole("menuitemradio", { name: /Warrior/ }), { delay: 100 })
    await userEvent.click(await canvas.findByRole("button", { name: "Spec: All specs" }))
    await userEvent.click(await body.findByRole("menuitemradio", { name: /Fury/ }), { delay: 100 })
    await expect(await canvas.findByRole("heading", { level: 1, name: "Fury Warrior" })).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole("button", { name: "Whole raid" }))
    await expect(await canvas.findByRole("heading", { level: 1, name: "Molten Core" })).toBeInTheDocument()
  },
}

/** The full table under the boards re-sorts by the clicked score column. */
export const FullListSort: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const list = within(canvas.getByRole("region", { name: "Molten Core Overview full list" }))
    await userEvent.click(list.getByRole("button", { name: "Renown" }))
    await expect(list.getByRole("button", { name: "Renown" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.type(list.getByRole("textbox", { name: "Find character or guild" }), "zzzz")
    await expect(list.getByText("No characters match.")).toBeInTheDocument()
  },
}
