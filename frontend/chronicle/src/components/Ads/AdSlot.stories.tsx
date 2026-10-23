import type { Meta, StoryObj } from "@storybook/react-vite"
import { MemoryRouter } from "react-router-dom"
import { AdSlot } from "./AdSlot"

const meta = {
  title: "Ads/AdSlot",
  component: AdSlot,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
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
      <div className="mx-auto flex max-w-[1920px] gap-6">
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

export const CompactRail: Story = {
  args: {
    placement: "instance-right-rail",
    railLayout: "compact",
  },
  render: (args) => (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto flex max-w-[1920px] gap-6">
        <main className="min-w-0 flex-1">
          <div className="mb-6 border-b pb-3 text-lg font-semibold">Instance</div>
          <div className="h-[720px] rounded-xl border bg-card" />
        </main>
        <div className="w-40 shrink-0">
          <AdSlot {...args} className="2xl:static" />
          <AdSlot
            {...args}
            placement="instance-right-rail-lower"
            minViewportHeight={0}
            className="mt-6 2xl:static"
          />
        </div>
      </div>
    </div>
  ),
}

export const PairedRails: Story = {
  args: {
    placement: "recent-right-rail",
    railLayout: "paired",
  },
  render: (args) => (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto flex max-w-[2080px] gap-6">
        <AdSlot {...args} placement="recent-left-rail" />
        <main className="min-w-0 flex-1">
          <div className="mb-6 border-b pb-3 text-lg font-semibold">Recent</div>
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 12 }, (_, index) => (
              <div key={index} className="h-32 rounded-xl border bg-card" />
            ))}
          </div>
        </main>
        <AdSlot {...args} />
      </div>
    </div>
  ),
}

export const Card: Story = {
  args: {
    placement: "recent-grid-card-1",
    format: "card",
  },
  render: (args) => (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto grid max-w-7xl grid-cols-4 gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-[266px] rounded-xl border bg-card" />
        ))}
        <AdSlot {...args} />
      </div>
    </div>
  ),
}

export const MobileCard: Story = {
  args: {
    placement: "recent-grid-card-1",
    format: "card",
  },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  render: (args) => (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mb-4 h-[200px] rounded-xl border bg-card" />
      <AdSlot {...args} />
      <div className="mt-4 h-[200px] rounded-xl border bg-card" />
    </div>
  ),
}

export const Sidebar: Story = {
  args: {
    placement: "statistics-encounter-sidebar",
    format: "sidebar",
    availableHeight: 600,
  },
  render: (args) => (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground">
      <aside className="w-[267px] border-r pr-4">
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
