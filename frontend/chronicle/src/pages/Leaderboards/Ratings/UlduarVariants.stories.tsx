import { useState, type CSSProperties } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, within } from "storybook/test"
import { MemoryRouter } from "react-router-dom"
import { ChevronDown } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu"
import { CHIP, difficultyChipClassName } from "@/components/EncounterDifficulty/encounterDifficulty"
import { cn } from "@/lib/utils"
import { RatingFullList } from "./RatingFullList"
import { LeaderboardHub } from "../Hub/LeaderboardHub"
import { type EncounterSelection } from "../Hub/encounterSelection"
import { METRIC_THEMES } from "./ratingThemes"
import type { RatingLiveData } from "./ratingLiveData"

// Story-only vocabulary and fixtures. These are not detection rules or published ratings.
interface Variant { label: string; short: string }
const ENCOUNTERS: Record<string, readonly Variant[]> = {
  "XT-002 Deconstructor": [{ label: "Normal", short: "N" }, { label: "Heartbreaker", short: "Heartbreaker" }],
  Freya: [
    { label: "Normal", short: "N" }, { label: "+1 elder", short: "+1" },
    { label: "+2 elders", short: "+2" }, { label: "+3 elders", short: "+3" },
  ],
  "Yogg-Saron": [
    { label: "Normal", short: "N" }, { label: "3 keepers", short: "3K" }, { label: "2 keepers", short: "2K" },
    { label: "1 keeper", short: "1K" }, { label: "0 keepers", short: "0K" },
  ],
}
const BOSSES = Object.keys(ENCOUNTERS)
/** The topmost hard mode (last tier listed) for each boss. */
const hardest = (boss: string) => [ENCOUNTERS[boss][ENCOUNTERS[boss].length - 1].label]
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x))

/** Per-boss difficulty chips. "All" = Combined (every kill, including unclassified history); any other chip selects only that variant. */
function VariantChips({ boss, active, onSelect }: { boss: string; active: readonly string[]; onSelect: (labels: string[]) => void }) {
  const chip = (key: string, label: string, text: string, on: boolean, toneClass: string, labels: string[]) => <button
    key={key} type="button" aria-pressed={on} aria-label={`${boss} ${label}`} title={label}
    onClick={() => onSelect(labels)}
    className={cn(toneClass, "cursor-pointer transition-opacity", on ? "ring-2" : "opacity-35 hover:opacity-80")}
  >{text}</button>
  return <div role="group" aria-label={`${boss} variants`} className="mb-2 ml-9 mr-1 flex flex-wrap items-center gap-1">
    {chip("all", "Combined", "All", active.length === 0, cn(CHIP, "bg-sky-500/15 text-sky-200 ring-sky-400/40"), [])}
    {ENCOUNTERS[boss].map(({ label, short }) =>
      chip(label, label, short, active.includes(label), difficultyChipClassName(label === "Normal" ? "" : "hard"), [label]))}
  </div>
}

// Match ScopeBar's compact picker, without exporting or changing its production implementation.
function StoryOnlyPicker({ label, value, options, onChange }: {
  label: string; value: string; options: readonly string[]; onChange: (value: string) => void
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger
      aria-label={`${label}: ${value}`}
      className="flex h-11 min-w-36 cursor-pointer items-center gap-3 rounded-md border bg-background/60 px-3 text-left text-sm outline-none transition-colors hover:bg-white/5 focus-visible:border-ring"
    >
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
        <span>{value}</span>
      </span>
      <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="styled-scrollbar max-h-80 min-w-48 overflow-y-auto">
      <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
        {options.map(option => <DropdownMenuRadioItem key={option} value={option}>{option}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}

function UlduarVariantPrototype({ initialEncounter = "XT-002 Deconstructor", initialVariants = [], initialSize = "25-player" }: {
  initialEncounter?: string; initialVariants?: string[]; initialSize?: string
}) {
  const [selection, setSelection] = useState<EncounterSelection>({ kind: "bosses", bosses: [initialEncounter] })
  const chosen = selection.kind === "bosses" ? selection.bosses : BOSSES
  const encounter = chosen.length === 1 ? chosen[0] : undefined
  // Empty or missing = Combined for that boss.
  const [variantByBoss, setVariantByBoss] = useState<Record<string, string[]>>({ [initialEncounter]: initialVariants })
  const activeFor = (boss: string) => variantByBoss[boss] ?? []
  const allHard = chosen.every(boss => sameSet(activeFor(boss), hardest(boss)))
  const hardModePressed = chosen.length === BOSSES.length && allHard
  const variant = allHard ? "Hardest modes"
    : chosen.every(boss => activeFor(boss).length === 0) ? "Combined"
      : encounter ? activeFor(encounter).join(" + ") : "Selected variants"
  const [size, setSize] = useState(initialSize)
  const [query, setQuery] = useState("")
  // Each invented character contributes one sample kill. Combined is their exact union,
  // including unclassified history, never a synonym for Normal or a sum of ratings.
  const kills = chosen.flatMap(boss => [...ENCOUNTERS[boss].map(v => v.label), "Unclassified"].flatMap((classification, group) =>
    [0, 1].map(index => ({
      classification, boss,
      entry: {
        id: `illustrative-${boss}-${group}-${index}`,
        name: classification === "Unclassified" ? `LegacySample${index + 1}` : `Sample${group + 1}${index + 1}`,
        cls: "MAGE", spec: "Fire", subSpec: "", realmLabel: "Chromiecraft",
        score: 99 - group * 6 - index * 3,
        raw: (size === "25-player" ? 8200 : 6400) - group * 380 - index * 170,
        durationMs: 180000 + group * 21000 + index * 8000,
        detail: "Illustrative fixture",
      },
    })),
  ))
  const selected = kills.filter(kill => {
    const active = activeFor(kill.boss)
    return active.length === 0 || active.includes(kill.classification)
  })
  const live: RatingLiveData = {
    catchupStatus: false,
    board: () => ({ status: "loading" }),
    page: ({ query: search }) => {
      const rows = selected.map(({ entry }, index) => ({ rank: index + 1, entry }))
        .filter(({ entry }) => entry.name.toLowerCase().includes(search.trim().toLowerCase()))
      return { status: "ready", data: { rows, total: rows.length, page: 0, hasPreviousPage: false, hasNextPage: false } }
    },
  }
  return <div className="bg-background text-foreground" style={{ "--metric": METRIC_THEMES.peak.accent } as CSSProperties}>
    <p className="border-b border-amber-400/20 bg-amber-400/5 px-4 py-2 text-xs text-amber-400" role="note">
      Interactive prototype · Chromiecraft / WotLK · Illustrative labels, kills and scores only. No real ratings have been classified.
    </p>
    <LeaderboardHub
      instanceName="Ulduar"
      initialScope={{ cls: "MAGE", spec: "Fire" }}
      tab="ratings"
      realm="Chromiecraft"
      ratingView="peak"
      live={{
        bosses: Object.keys(ENCOUNTERS),
        realms: ["Chromiecraft"],
        selection,
        onSelection: next => { setSelection(next); setVariantByBoss({}) },
        encounterSidebarExtras: {
          actions: <button
            type="button" aria-pressed={hardModePressed} aria-label="Hard mode"
            title="Topmost hard mode for every boss. Click again for Combined."
            className={cn(difficultyChipClassName("hard"), "h-5 cursor-pointer px-2 text-xs", hardModePressed ? "ring-2" : "opacity-70 hover:opacity-100")}
            onClick={() => {
              setSelection({ kind: "bosses", bosses: BOSSES })
              setVariantByBoss(hardModePressed ? {} : Object.fromEntries(BOSSES.map(boss => [boss, hardest(boss)])))
            }}
          >Hard mode</button>,
          afterBoss: boss => <VariantChips boss={boss} active={activeFor(boss)} onSelect={labels => {
            if (!chosen.includes(boss)) setSelection({ kind: "bosses", bosses: [boss] })
            setVariantByBoss(current => ({ ...(chosen.includes(boss) ? current : {}), [boss]: labels }))
          }} />,
        },
        cohort: { difficultyName: "Normal", maxPlayers: size === "25-player" ? 25 : 10 },
        cohortPicker: <StoryOnlyPicker label="Raid size" value={size} options={["10-player", "25-player"]} onChange={setSize} />,
        specsFor: cls => cls === "MAGE" ? ["Fire"] : [],
        subSpecsFor: () => [],
        renderTab: context => <div className="space-y-4">
          <RatingFullList
            key={`${chosen.join(":")}:${JSON.stringify(variantByBoss)}:${size}`}
            scope={context.scope}
            title={`${encounter ?? "Selected encounters"} · ${variant}`}
            period="180d" view="peak" query={query} onQuery={setQuery} live={live}
            encounterCount={1}
            toolbar={<span className="relative rounded border px-2 py-1 text-xs text-muted-foreground">Illustrative Peak · Fire Mage DPS</span>}
          />
          <p className="text-xs text-muted-foreground" role="status">{selected.length} illustrative kills · {size}. “All” = Combined, which includes unclassified history; any other chip narrows to exactly that variant. Hard mode selects the topmost hard mode for each boss (Heartbreaker, +3 elders, 0 keepers). Freya Normal = 0 elders; Yogg Normal = 4 keepers. This is a fixture preview, not a published combined hard rating. Career-wide metrics always use Combined cohorts and are unaffected by these encounter-specific choices.</p>
          <p className="text-xs text-muted-foreground">Sample data covers XT, Freya and Yogg only. Try searching “LegacySample”: these unclassified examples appear only in Combined. Scores are fixed fixtures, not a proposed rating formula.</p>
        </div>,
      }}
    />
  </div>
}

const meta = {
  title: "Pages/Leaderboards/Ratings/Ulduar Variants",
  component: UlduarVariantPrototype,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
} satisfies Meta<typeof UlduarVariantPrototype>
export default meta
type Story = StoryObj<typeof meta>

export const Combined: Story = {}
export const SelectionInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const portal = within(canvasElement.ownerDocument.body)
    await expect(canvas.getByText("LegacySample1")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Hard mode", exact: true }))
    await expect(canvas.getByRole("button", { name: "Hard mode", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByRole("button", { name: "Freya +3 elders" })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByRole("button", { name: "Freya +2 elders" })).toHaveAttribute("aria-pressed", "false")
    await expect(canvas.queryByText("LegacySample1")).not.toBeInTheDocument()
    await expect(canvas.queryByText("Sample11")).not.toBeInTheDocument()
    await expect(canvas.getByRole("status")).toHaveTextContent("6 illustrative kills")
    await userEvent.click(canvas.getByRole("button", { name: "Hard mode", exact: true }))
    await expect(canvas.getByRole("status")).toHaveTextContent("28 illustrative kills")
    await userEvent.click(canvas.getByRole("button", { name: "Freya", exact: true }))
    await userEvent.click(canvas.getByRole("button", { name: "Freya +3 elders" }))
    await expect(canvas.getByRole("button", { name: "Freya +3 elders" })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByRole("status")).toHaveTextContent("2 illustrative kills")
    await expect(canvas.getByText("Sample41")).toBeVisible()
    await expect(canvas.queryByText("LegacySample1")).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Freya Normal" }))
    await expect(canvas.getByRole("button", { name: "Freya +3 elders" })).toHaveAttribute("aria-pressed", "false")
    await expect(canvas.getByRole("status")).toHaveTextContent("2 illustrative kills")
    await userEvent.click(canvas.getByRole("button", { name: "Freya Combined" }))
    await expect(canvas.getByRole("status")).toHaveTextContent("10 illustrative kills")
    await userEvent.click(canvas.getByRole("button", { name: "Freya +3 elders" }))
    await userEvent.click(canvas.getByRole("button", { name: "Raid size: 25-player" }))
    await userEvent.click(portal.getByRole("menuitemradio", { name: "10-player" }))
    await expect(await canvas.findByRole("button", { name: "Freya +3 elders" })).toHaveAttribute("aria-pressed", "true")
    await fireEvent.click(canvas.getByRole("button", { name: "Yogg-Saron", exact: true }), { ctrlKey: true })
    await expect(canvas.getByRole("button", { name: "Freya", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByRole("button", { name: "Yogg-Saron", exact: true })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(canvas.getByRole("button", { name: "All bosses", exact: true }))
    await expect(canvas.getByText("3 of 3 selected")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Hard mode", exact: true })).toHaveAttribute("aria-pressed", "false")
    await expect(canvas.getByRole("status")).toHaveTextContent("28 illustrative kills")
    await expect(canvas.getAllByText("LegacySample1")).toHaveLength(3)
  },
}
export const Normal: Story = { args: { initialVariants: ["Normal"] } }
export const Heartbreaker: Story = { args: { initialVariants: ["Heartbreaker"] } }
export const FreyaThreeElders: Story = { args: { initialEncounter: "Freya", initialVariants: ["+3 elders"] } }
export const YoggZeroKeepers: Story = { args: { initialEncounter: "Yogg-Saron", initialVariants: ["0 keepers"] } }
export const Narrow: Story = {
  args: { initialEncounter: "Yogg-Saron", initialSize: "10-player" },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  decorators: [(Story) => <div className="mx-auto max-w-[390px]"><Story /></div>],
  play: async ({ canvasElement }) => {
    if (window.innerWidth >= 1024) return
    const portal = within(canvasElement.ownerDocument.body)
    await userEvent.click(await portal.findByRole("button", { name: "Show encounters" }))
    const drawer = within(await portal.findByRole("dialog", { name: "Encounter selector" }))
    await userEvent.click(drawer.getByRole("button", { name: "Hard mode", exact: true }))
    await expect(drawer.getByRole("button", { name: "Freya +3 elders" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(drawer.getByRole("button", { name: "All bosses", exact: true }))
    await expect(drawer.getByRole("button", { name: "Freya Combined" })).toHaveAttribute("aria-pressed", "true")
  },
}
