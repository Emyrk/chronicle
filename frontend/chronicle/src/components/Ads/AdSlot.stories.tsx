import type { Meta, StoryObj } from "@storybook/react-vite"
import { AdSlot } from "./AdSlot"

const meta = {
  title: "Ads/AdSlot",
  component: AdSlot,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    hostname: "localhost",
    placement: "leaderboards-right-rail",
    format: "rail",
  },
} satisfies Meta<typeof AdSlot>

export default meta

type Story = StoryObj<typeof meta>

export const Rail: Story = {
  render: (args) => (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto flex max-w-[1800px] gap-6">
        <main className="min-w-0 flex-1">
          <div className="mb-6 border-b pb-3 text-lg font-semibold">Leaderboard</div>
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 9 }, (_, index) => (
              <div key={index} className="h-32 rounded-xl border bg-card" />
            ))}
          </div>
        </main>
        <AdSlot {...args} />
      </div>
    </div>
  ),
}

export const Responsive: Story = {
  args: {
    placement: "statistics-encounter-sidebar",
    format: "responsive",
  },
  render: (args) => (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground">
      <aside className="w-64 border-r pr-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Encounters</h2>
        <div className="space-y-1">
          {["Lucifron", "Magmadar", "Gehennas", "Garr", "Baron Geddon"].map((encounter) => (
            <div key={encounter} className="rounded-md bg-primary-darker px-3 py-2 text-sm text-primary-foreground">
              {encounter}
            </div>
          ))}
        </div>
        <AdSlot {...args} className="mt-5" />
      </aside>
    </div>
  ),
}
