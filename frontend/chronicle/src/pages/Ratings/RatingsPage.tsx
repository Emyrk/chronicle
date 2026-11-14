import { useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowLeft, ArrowRight, BarChart3, LayoutGrid, Loader2, Percent, Search, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatClassLabel } from "@/pages/ArmoryPage/characterDisplay"
import { ToolsBackLink } from "@/pages/Tools/ToolsBackLink"
import { averageAcrossBosses, normalize, ratePlayerBoss } from "./ratingMath"
import { BossCalculator, LensTabs } from "./BossCalculator"
import {
  MasteryIcon,
  PeakIcon,
  QUESTION,
  RATING_ACCENT,
  RenownIcon,
  fmt,
  fmtInt,
  type Lens,
} from "./ratingLens"
import {
  raidLabel,
  raidScopeLabel,
  useMyRatingData,
  type RatingDataset,
} from "./useMyRatingData"
import { parseRatingsLink } from "./ratingsLink"
import { RaidPanel } from "./RaidPanel"

// Example player: a Fury Warrior's Nefarian kills, in chronological order.
// Parses are illustrative 60-day-window scores; ratings never read them.
const EXAMPLE: RatingDataset = {
  key: "example",
  bossName: "Nefarian",
  cohortLabel: "Fury Warrior",
  unit: "DPS",
  kills: [1000, 820, 1120, 1080, 1060, 1150, 1090, 1130, 1070, 1140].map((value, i) => ({
    value,
    parse: [92, 68, 98, 96, 94, 100, 97, 99, 95, 99][i],
  })),
  benchmark: 1180,
  award: 9, // vanilla seed in migration 000343
  renownKills: 10,
  example: true,
}
type Source = "example" | "character"

export function RatingsPage() {
  const [searchParams] = useSearchParams()
  const [link] = useState(() => parseRatingsLink(searchParams))
  const [lens, setLens] = useState<Lens>("mastery")
  const [source, setSource] = useState<Source>(link ? "character" : "example")
  // Slider positions belong to one dataset; switching datasets resets them.
  const [sliders, setSliders] = useState<{ key: string; killCount?: number; benchmark?: number }>({ key: "" })
  const my = useMyRatingData(source === "character", link)

  const dataset = source === "character" ? my.dataset : EXAMPLE
  // The benchmark section keeps teaching with the example while no character data is available.
  const shown = dataset ?? EXAMPLE
  const own = sliders.key === shown.key ? sliders : { key: shown.key }
  const killCount = Math.min(own.killCount ?? shown.kills.length, shown.kills.length)
  const benchmark = own.benchmark ?? shown.benchmark
  const setKillCount = (n: number) => setSliders({ ...own, killCount: n })
  const setBenchmark = (n: number) => setSliders({ ...own, benchmark: n })

  // The benchmark section's Peak follows the kills-logged slider.
  const rating = ratePlayerBoss(shown.kills.slice(0, killCount).map((k) => k.value), benchmark)

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <ToolsBackLink className="mb-5" />

      <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Understanding your stats</p>
      <h1 className="mb-2 text-3xl font-bold">How Ratings Work</h1>
      <p className="mb-8 max-w-3xl text-muted-foreground">
        Two numbers describe what you did on one boss kill. Three ratings summarize your whole history on
        a boss, an encounter set, or a group of bosses. Ratings power Chronicle's Peak, Mastery, and Renown
        leaderboards.
      </p>

      <Overview />

      {/* Interactive example */}
      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mb-1 text-2xl font-semibold">See It in Action</h2>
            <p className="text-muted-foreground">
              {source === "example"
                ? "One example player's Nefarian kills as a Fury Warrior, viewed through each lens."
                : my.character
                  ? my.raidView && !my.group
                    ? `${my.character.name}'s ${my.raidView.raidLabel} bosses, viewed through each lens.`
                    : `${my.character.name}'s kills on one boss, viewed through each lens.`
                  : "Search the Armory to inspect any character's kills."}
            </p>
          </div>
          <div className="inline-flex rounded-lg border bg-card p-1" role="radiogroup" aria-label="Data source">
            {(
              [
                ["example", "Example player"],
                ["character", "Armory character"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={source === id}
                onClick={() => setSource(id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  source === id ? "bg-sky-500/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {source === "character" && <MyDataPicker my={my} />}

        <LensTabs lens={lens} onChange={setLens} />

        {my.raidView && !my.group && source === "character" ? (
          <RaidPanel lens={lens} view={my.raidView} onSelectBoss={my.selectBoss} />
        ) : dataset ? (
          <div className="rounded-xl border bg-card p-4 sm:p-6">
            {!dataset.example && my.raidView && (
              <button
                type="button"
                onClick={() => my.selectBoss("")}
                className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-sky-300 hover:text-sky-200 hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                All {my.raidView.raidLabel} bosses
              </button>
            )}
            <BossCalculator
              lens={lens}
              dataset={dataset}
              killCount={killCount}
              setKillCount={setKillCount}
              benchmark={benchmark}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center text-muted-foreground">
            <MyDataStatus my={my} />
          </div>
        )}
      </section>

      <BenchmarkSection dataset={shown} benchmark={benchmark} setBenchmark={setBenchmark} rawPeak={rating.rawPeak} />
      <SmallSamples />
      <MultipleBosses />
      <DpsOrHps />
      <Guilds />
      <Cohorts />

      <section className="mb-8 rounded-lg bg-muted/30 p-4">
        <p className="text-muted-foreground">
          Looking for how individual kills are scored?{" "}
          <Link to="/parsing" className="font-medium text-blue-400 hover:text-blue-300">
            Read how parses work
          </Link>
          .
        </p>
      </section>
    </div>
  )
}

type MyData = ReturnType<typeof useMyRatingData>

const selectClass =
  "h-9 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-sky-400"

function MyDataPicker({ my }: { my: MyData }) {
  const showResults = my.searchQuery.trim().length >= 2
  return (
    <div className="mb-4 space-y-3 text-sm">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={my.searchQuery}
          onChange={(event) => my.setSearchQuery(event.target.value)}
          placeholder={my.character ? `Search for another character…` : "Search Armory characters…"}
          className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-sky-400"
        />
        {showResults && (
          <div className="styled-scrollbar absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
            {my.search.isLoading || my.search.isFetching ? (
              <p className="flex items-center gap-2 p-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </p>
            ) : my.searchResults.length === 0 ? (
              <p className="p-3 text-muted-foreground">No Armory characters match.</p>
            ) : (
              my.searchResults.slice(0, 12).map((player) => (
                <button
                  key={`${player.realm_id}|${player.id}`}
                  type="button"
                  onClick={() => my.selectCharacter(player)}
                  className="flex w-full items-baseline gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/60"
                >
                  <span className="font-medium text-foreground">{player.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatClassLabel(player.class)} · {player.realm_name}
                    {player.guild_name && ` · <${player.guild_name}>`}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {my.character && (
        <div className="space-y-3 rounded-lg border bg-background/40 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <PickerField label="Character">
              <span className="flex h-9 items-center rounded-md border bg-card px-3 font-medium text-foreground">
                {my.character.name} · {my.character.realm_name}
              </span>
            </PickerField>
            {my.raids.length > 0 && (
              <PickerField label="Raid">
                <select className={selectClass} value={my.raid?.key ?? ""} onChange={(e) => my.selectRaid(e.target.value)}>
                  {my.raids.map((r) => (
                    <option key={r.key} value={r.key}>
                      {raidLabel(r)}
                    </option>
                  ))}
                </select>
              </PickerField>
            )}
            {my.scope && (
              <PickerField label="Spec">
                {my.scopes.length > 1 ? (
                  <select className={selectClass} value={my.scope.key} onChange={(e) => my.selectScope(e.target.value)}>
                    {my.scopes.map((s) => (
                      <option key={s.key} value={s.key}>
                        {raidScopeLabel(s)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="flex h-9 items-center text-foreground">{raidScopeLabel(my.scope)}</span>
                )}
              </PickerField>
            )}
          </div>
          {my.raidView && (
            <PickerField label="Boss">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Boss">
                <BossChip active={!my.group} onClick={() => my.selectBoss("")}>
                  <LayoutGrid className="h-3.5 w-3.5" />
                  All bosses
                </BossChip>
                {my.raidView.bosses.map((b) => (
                  <BossChip
                    key={b.encounterName}
                    active={my.group?.encounter_name === b.encounterName}
                    disabled={!b.groupKey}
                    title={b.groupKey ? undefined : `No ${my.raidView!.unit} kills as ${my.raidView!.scope.label}`}
                    onClick={() => my.selectBoss(b.encounterName)}
                  >
                    {b.encounterName}
                    <span className="tabular-nums opacity-60">{b.kills}</span>
                  </BossChip>
                ))}
              </div>
            </PickerField>
          )}
        </div>
      )}
      {my.truncated && (
        <p className="text-xs text-amber-300">Showing the most recent history only; this character has a lot of kills.</p>
      )}
    </div>
  )
}

function PickerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

function BossChip({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-sky-400 bg-sky-500/15 font-medium text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-sky-400/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function MyDataStatus({ my }: { my: MyData }) {
  switch (my.state.status) {
    case "choose-character":
      return <p>Search for an Armory character above to see their rated boss kills.</p>
    case "loading":
      return <p>Loading {my.character?.name ?? "character"}’s kills…</p>
    case "no-kills":
      return <p>{my.character?.name ?? "This character"} has no rated boss kills on this server yet.</p>
    case "error":
      return <p>{my.state.message || "Could not load this character's rating history."}</p>
    default:
      return null
  }
}

function Overview() {
  const metrics = [
    { icon: <BarChart3 className="h-5 w-5" />, title: "Performance", question: QUESTION.performance, body: "Your raw DPS or HPS on one boss kill." },
    {
      icon: <Percent className="h-5 w-5" />,
      title: "Parse",
      question: QUESTION.parse,
      body: "That performance scored 0–100 against kills from the 60 days before the raid.",
    },
  ]
  const ratings = [
    {
      icon: <PeakIcon className="h-5 w-5" />,
      accent: RATING_ACCENT.peak,
      title: "Peak",
      question: QUESTION.peak,
      body: "Your best kill against the best kill ever recorded in your cohort.",
    },
    {
      icon: <MasteryIcon className="h-5 w-5" />,
      accent: RATING_ACCENT.mastery,
      title: "Mastery",
      question: QUESTION.mastery,
      body: "How consistently you perform: your best kill, your typical kills, and your weaker kills, blended.",
    },
    {
      icon: <RenownIcon className="h-5 w-5" />,
      accent: RATING_ACCENT.renown,
      title: "Renown",
      question: QUESTION.renown,
      body: "Points for every boss you've killed. It only goes up.",
    },
  ]
  // Two rows: the per-kill metrics, then the ratings built from them. Cards in a row share a height.
  return (
    <section className="mb-10 space-y-5 rounded-xl border bg-card p-4 sm:p-5">
      <div>
        <h2 className="mb-2 text-sm font-semibold">Per-kill metrics</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {metrics.map((m) => (
            <OverviewCard key={m.title} {...m} />
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold">
          Ratings <span className="font-normal text-muted-foreground">(your whole history, built from those kills)</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {ratings.map((m) => (
            <OverviewCard key={m.title} {...m} />
          ))}
        </div>
      </div>
    </section>
  )
}

function OverviewCard({ icon, title, question, body, accent }: { icon: ReactNode; title: string; question: string; body: string; accent?: string }) {
  return (
    <div
      className="flex h-full flex-col rounded-lg border bg-background/40 p-4"
      style={accent ? { boxShadow: `inset 0 2px 0 ${accent}` } : undefined}
    >
      <div className="mb-2 flex items-center gap-2.5">
        <div
          className="inline-flex rounded-md p-1.5 text-muted-foreground"
          style={accent ? { color: accent, backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` } : { backgroundColor: "var(--color-muted)" }}
        >
          {icon}
        </div>
        <div className="font-semibold" style={accent ? { color: accent } : undefined}>
          {title}
        </div>
      </div>
      <p className="mb-1.5 text-sm font-medium italic text-foreground/85">{question}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function BenchmarkSection({
  dataset,
  benchmark,
  setBenchmark,
  rawPeak,
}: {
  dataset: RatingDataset
  benchmark: number
  setBenchmark: (n: number) => void
  rawPeak: number
}) {
  const today = dataset.benchmark
  const todayPeak = normalize(rawPeak, today)
  const nowPeak = normalize(rawPeak, benchmark)
  const step = Math.max(1, Math.round(today / 120))
  return (
    <section className="mb-10 grid gap-6 rounded-xl border bg-card p-4 sm:p-6 lg:grid-cols-2">
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
          <TrendingDown className="h-5 w-5 text-sky-400" />
          Why Ratings Change
        </h2>
        <p className="mb-3 text-muted-foreground">
          Peak and Mastery are measured against the <strong>best kill ever recorded</strong> in your cohort. If
          someone beats it, your ratings go down a bit, even if you haven't raided since. Your kills and their parses
          stay the same.
        </p>
        <p className="text-muted-foreground">
          The benchmark covers all time, so it only goes up, unless the log holding the record is removed. Drag the
          slider to set a new record and watch the {dataset.example ? "example" : "chart"} above update.
        </p>
      </div>
      <div className="rounded-lg border bg-background/40 p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
          <div>
            <div className="mb-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs">Today</div>
            <div className="text-muted-foreground">Benchmark {fmtInt(today)}</div>
            <div className="text-3xl font-bold tabular-nums">{fmt(todayPeak)}</div>
            <div className="text-xs text-muted-foreground">Peak</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="mb-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs">After a new record</div>
            <div className="text-muted-foreground">Benchmark {fmtInt(benchmark)}</div>
            <div className="text-3xl font-bold tabular-nums text-sky-300">{fmt(nowPeak)}</div>
            <div className="text-xs text-muted-foreground">Peak</div>
          </div>
        </div>
        <label className="mt-4 block text-sm text-muted-foreground">
          New server record: <strong className="tabular-nums text-foreground">{fmtInt(benchmark)} {dataset.unit}</strong>
          <input
            type="range"
            min={today}
            max={today * 1.3}
            step={step}
            value={benchmark}
            onChange={(e) => setBenchmark(Number(e.target.value))}
            className="mt-2 block w-full accent-sky-500"
          />
        </label>
      </div>
    </section>
  )
}


function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8 max-w-3xl">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function SmallSamples() {
  const rows = [1, 2, 3].map((n) => ({ n, m: ratePlayerBoss(Array(n).fill(100), 100).mastery }))
  return (
    <Section title="Few Kills">
      <p className="mb-3 text-muted-foreground">
        Mastery rewards doing well more than once. If you don't have enough kills to fill every band, the empty
        ones count as 0. Even perfect kills can't reach 100 Mastery until you have three:
      </p>
      <table className="mb-3 text-sm tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th className="pr-6 text-left font-medium">Perfect kills</th>
            <th className="pr-6 text-left font-medium">Bands filled</th>
            <th className="text-right font-medium">Max Mastery</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ n, m }) => (
            <tr key={n}>
              <td className="pr-6">{n}</td>
              <td className="pr-6 text-muted-foreground">{["Peak", "Peak + Form", "Peak + Form + Floor"][n - 1]}</td>
              <td className="text-right">{fmt(m, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground">
        Peak has no such limit. One great kill gives you your full Peak.
      </p>
    </Section>
  )
}

function MultipleBosses() {
  const bosses: { name: string; mastery: number | null }[] = [
    { name: "Chromaggus", mastery: 91.2 },
    { name: "Nefarian", mastery: 94.4 },
    { name: "Ebonroc", mastery: null },
  ]
  const avg = averageAcrossBosses(bosses.map((b) => b.mastery))
  return (
    <Section title="More Than One Boss">
      <p className="mb-3 text-muted-foreground">
        Leaderboards can rate a single boss, an instance's encounter set, or a custom group of bosses. Peak and
        Mastery are then the <strong>average across every selected boss</strong>, all weighted equally. A boss you
        haven't killed counts as 0, so a full clear beats a partial one. Renown just adds up.
      </p>
      <div className="inline-block rounded-lg border bg-card p-3 text-sm tabular-nums">
        {bosses.map((b) => (
          <div key={b.name} className="flex justify-between gap-8">
            <span>{b.name}</span>
            <span className={b.mastery === null ? "text-muted-foreground" : ""}>
              {b.mastery === null ? "no kills → 0" : fmt(b.mastery)}
            </span>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-8 border-t pt-1 font-semibold">
          <span>Mastery (÷ {bosses.length})</span>
          <span>{fmt(avg)}</span>
        </div>
      </div>
    </Section>
  )
}

function DpsOrHps() {
  const examples = [
    { who: "Fury Warrior", dps: 1150, hps: 40 },
    { who: "Holy Priest", dps: 90, hps: 820 },
    { who: "Shadow Priest", dps: 610, hps: 650 },
  ]
  return (
    <Section title="DPS or HPS?">
      <p className="mb-3 text-muted-foreground">
        Each kill counts toward <strong>either</strong> DPS or HPS, never both. Chronicle takes whichever of the two
        numbers is higher for that kill (DPS wins a tie). The kill is then rated only on that board.
      </p>
      <table className="mb-3 text-sm tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th className="pr-6 text-left font-medium">Player</th>
            <th className="pr-6 text-right font-medium">DPS</th>
            <th className="pr-6 text-right font-medium">HPS</th>
            <th className="text-left font-medium">Counts as</th>
          </tr>
        </thead>
        <tbody>
          {examples.map((e) => {
            const dps = e.dps >= e.hps
            return (
              <tr key={e.who}>
                <td className="pr-6">{e.who}</td>
                <td className={cn("pr-6 text-right", !dps && "text-muted-foreground")}>{fmtInt(e.dps)}</td>
                <td className={cn("pr-6 text-right", dps && "text-muted-foreground")}>{fmtInt(e.hps)}</td>
                <td className="font-medium">{dps ? "DPS" : "HPS"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-muted-foreground">
        This is decided kill by kill. If a Shadow Priest heals more than they damage on one fight, that kill is rated
        as HPS. Their other kills stay on the DPS board. Renown doesn't care which one was picked: each kill earns its
        award once.
      </p>
    </Section>
  )
}

function Guilds() {
  return (
    <Section title="Guild Ratings">
      <p className="mb-3 text-muted-foreground">
        Guilds are rated the same way, using kill times instead of DPS. They can be rated on single boss kills and on
        full clears. The benchmark is the fastest time on the server, and a faster kill scores higher:
      </p>
      <p className="mb-3 font-mono text-sm text-muted-foreground">score = 100 × fastest time ÷ your time</p>
      <p className="text-muted-foreground">
        A 5:00 kill against a 4:00 record scores 80. Form and Floor average speed (1 ÷ time) rather than kill times,
        so one very slow kill can't drag the average down more than one very fast kill pulls it up. Guild Renown
        counts every boss the guild has killed.
      </p>
    </Section>
  )
}

function Cohorts() {
  return (
    <Section title="Who You're Compared Against">
      <ul className="list-inside list-disc space-y-1 text-muted-foreground">
        <li>
          Your <strong>cohort</strong> is the same server, boss, difficulty, raid size, class, spec, and subspec. DPS
          and HPS are separate.
        </li>
        <li>Ratings count your whole history. There are no seasons or rolling windows.</li>
        <li>Only clean boss kills count. Wipes, trash, unlisted logs, and invalidated raids don't.</li>
        <li>Duplicate uploads of the same raid count once.</li>
        <li>If you play more than one spec, each spec is rated separately.</li>
        <li>Renown awards can differ by difficulty or raid size. They're set per boss, not by performance.</li>
      </ul>
    </Section>
  )
}
