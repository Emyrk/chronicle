import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState, type ComponentProps } from "react"
import { MemoryRouter } from "react-router-dom"
import { SpeedrunsTab, type RunsBoard } from "./SpeedrunsTab"
import { instanceBosses, speedruns } from "./hub.fixtures"

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

// Live data whose runner-up and fourth place have no guild, as All runs can return.
const runs = speedruns(undefined, bosses, "Molten Core").map((run, i) =>
  i === 1 || i === 3 ? { ...run, guild_id: "", guild_name: "", guild_logo_url: "" } : run)
export const AllRunsWithNoGuild: Story = {
  args: { runsBoard: "all", live: { clears: { entries: runs } } },
}
export const SingleBossKillTimesWithNoGuild: Story = {
  args: {
    selection: { kind: "bosses", bosses: ["Ragnaros"] }, view: "kills", runsBoard: "all",
    live: { kills: { totalCount: 3, entries: runs.slice(0, 3).map((run, i) => ({
      encounter_id: `kill-${i}`, instance_id: run.instance_id, encounter_name: "Ragnaros", instance_name: "Molten Core",
      guild_name: run.guild_name, guild_id: run.guild_id, realm_name: run.realm_name,
      duration_secs: 160 + i * 7, killed_at: run.completion_time, log_hashed_slug: "",
    })) } },
  },
}
