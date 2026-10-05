import type { Meta, StoryObj } from "@storybook/react-vite"
import { LeaderboardAdSlot } from "./LeaderboardAdSlot"

const meta = {
  title: "Ads/LeaderboardAdSlot",
  component: LeaderboardAdSlot,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background px-4 py-8 text-foreground">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 border-b pb-3 text-lg font-semibold">Leaderboard</div>
          <Story />
          <div className="mt-2 grid grid-cols-3 gap-3">
            {["Rank", "Player", "Performance"].map((label) => (
              <div key={label} className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  ],
  args: {
    hostname: "localhost",
  },
} satisfies Meta<typeof LeaderboardAdSlot>

export default meta

type Story = StoryObj<typeof meta>

export const Preview: Story = {}
