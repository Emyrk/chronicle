import { useMemo, useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { BarChart3, CheckCircle2 } from "lucide-react"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import { cn } from "@/lib/utils"
import { EmeraldSanctumModeSwitch } from "./EmeraldSanctumModeSwitch"
import {
  getEmeraldSanctumEncounterNames,
  type EmeraldSanctumMode,
} from "./emeraldSanctumState"

const ENCOUNTERS = ["Erennius", "Solnius", "Solnius (Hard Mode)"]

const MOCK_PLAYERS = {
  normal: [
    { name: "Verdant", spec: "Rogue", dps: "1,284", width: "92%" },
    { name: "Starbloom", spec: "Mage", dps: "1,231", width: "84%" },
    { name: "Thornwall", spec: "Warrior", dps: "1,177", width: "76%" },
  ],
  hard: [
    { name: "Starbloom", spec: "Mage", dps: "1,106", width: "92%" },
    { name: "Verdant", spec: "Rogue", dps: "1,042", width: "82%" },
    { name: "Thornwall", spec: "Warrior", dps: "998", width: "73%" },
  ],
} satisfies Record<EmeraldSanctumMode, Array<{ name: string; spec: string; dps: string; width: string }>>

function EmeraldSanctumRankingsMock() {
  const [mode, setMode] = useState<EmeraldSanctumMode>("normal")
  const selectedEncounters = useMemo(
    () => getEmeraldSanctumEncounterNames(mode, ENCOUNTERS),
    [mode],
  )

  return (
    <div className="min-h-screen bg-background p-5 text-foreground sm:p-10">
      <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-[220px_1fr]">
        <aside className="rounded-xl border bg-card/50 p-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Mode</p>
          <EmeraldSanctumModeSwitch value={mode} onChange={setMode} />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Encounters</p>
          <div className="mt-3 space-y-1.5">
            {ENCOUNTERS.map((encounter) => {
              const selected = selectedEncounters.has(encounter)
              return (
                <div
                  key={encounter}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                    selected
                      ? "border-l-3 border-l-emerald-300 bg-emerald-950/70 text-emerald-50"
                      : "text-muted-foreground/45",
                  )}
                >
                  <CheckCircle2 className={cn("h-4 w-4", selected ? "text-emerald-400" : "opacity-25")} />
                  {encounter}
                </div>
              )
            })}
          </div>
        </aside>

        <main className="space-y-5">
          <section className="relative overflow-hidden rounded-xl border">
            <img
              src={getInstanceBackground("Emerald Sanctum")}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-55"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-emerald-950/45" />
            <div className="relative flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs text-muted-foreground">Back to Rankings</p>
                <h1 className="mt-2 text-2xl font-bold">Emerald Sanctum</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  DPS across the selected Normal or Hard Mode route.
                </p>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border bg-card/45">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <p className="text-sm font-semibold">DPS Rankings</p>
                <p className="text-xs text-muted-foreground">
                  {mode === "hard" ? "Solnius (Hard Mode)" : "Erennius + Solnius"}
                </p>
              </div>
              <BarChart3 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="space-y-4 p-5">
              {MOCK_PLAYERS[mode].map((player, index) => (
                <div key={player.name} className="grid grid-cols-[28px_110px_1fr_64px] items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">#{index + 1}</span>
                  <span>
                    <span className="block font-medium">{player.name}</span>
                    <span className="block text-[10px] text-muted-foreground">{player.spec}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-300"
                      style={{ width: player.width }}
                    />
                  </span>
                  <span className="text-right font-mono text-xs font-semibold">{player.dps}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

const meta = {
  title: "Rankings/Emerald Sanctum Mode",
  component: EmeraldSanctumRankingsMock,
  parameters: {
    layout: "fullscreen",
    backgrounds: { default: "dark" },
  },
} satisfies Meta<typeof EmeraldSanctumRankingsMock>

export default meta
type Story = StoryObj<typeof meta>

export const InteractiveMock: Story = {}
