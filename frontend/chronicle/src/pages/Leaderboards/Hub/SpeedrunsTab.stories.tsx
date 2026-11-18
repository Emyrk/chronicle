import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState, type ComponentProps } from "react"
import { MemoryRouter } from "react-router-dom"
import { SpeedrunsTab, type RunsBoard } from "./SpeedrunsTab"
import { instanceBosses } from "./hub.fixtures"

/** The run-ranking toggle beside the board switch, in each state. Boards use story fixtures. */
function Toggleable(props: ComponentProps<typeof SpeedrunsTab>) {
  const [runsBoard, setRunsBoard] = useState<RunsBoard>(props.runsBoard ?? "guild")
  return (
    <div className="p-6">
      <SpeedrunsTab {...props} runsBoard={runsBoard} onRunsBoard={setRunsBoard} />
    </div>
  )
}

const bosses = instanceBosses("Molten Core")

const meta = {
  title: "Pages/Leaderboards/Hub/Speedruns",
  component: Toggleable,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
  args: { instanceName: "Molten Core", bosses, selection: { kind: "clear" }, view: "clear" },
} satisfies Meta<typeof Toggleable>

export default meta
type Story = StoryObj<typeof meta>

export const GuildBest: Story = {}
export const AllRuns: Story = { args: { runsBoard: "all" } }
export const AllRunsLocked: Story = { args: { allRunsLocked: true } }
export const SingleBossKillTimes: Story = { args: { selection: { kind: "bosses", bosses: ["Ragnaros"] }, view: "kills" } }
export const SingleBossKillTimesLocked: Story = { args: { selection: { kind: "bosses", bosses: ["Ragnaros"] }, view: "kills", allRunsLocked: true } }
