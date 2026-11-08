import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, BarChart3, Crown, Layers, Medal, Percent, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { parseColor } from "@/pages/Instance/parseColors"
import { ToolsBackLink } from "@/pages/Tools/ToolsBackLink"
import { MASTERY_WEIGHTS, averageAcrossBosses, normalize, ratePlayerBoss, type Band } from "./ratingMath"

// Example player: a Fury Warrior's Nefarian kills, in chronological order.
// Parses are illustrative 60-day-window scores; ratings never read them.
const EXAMPLE_KILLS = [
  { dps: 1000, parse: 92 },
  { dps: 820, parse: 68 },
  { dps: 1120, parse: 98 },
  { dps: 1080, parse: 96 },
  { dps: 1060, parse: 94 },
  { dps: 1150, parse: 100 },
  { dps: 1090, parse: 97 },
  { dps: 1130, parse: 99 },
  { dps: 1070, parse: 95 },
  { dps: 1140, parse: 99 },
]
const TODAY_BENCHMARK = 1180
const NEFARIAN_AWARD = 9 // vanilla seed in migration 000343
const OTHER_BWL_BOSSES = [
  { name: "Razorgore the Untamed", kills: 12, award: 2 },
  { name: "Vaelastrasz the Corrupt", kills: 12, award: 2 },
  { name: "Broodlord Lashlayer", kills: 11, award: 2 },
  { name: "Firemaw", kills: 11, award: 2 },
  { name: "Ebonroc", kills: 11, award: 2 },
  { name: "Flamegor", kills: 11, award: 2 },
  { name: "Chromaggus", kills: 10, award: 2 },
]

type Lens = "performance" | "parse" | "peak" | "mastery" | "renown"

const LENSES: { id: Lens; label: string; icon: ReactNode; kind: "metric" | "rating" }[] = [
  { id: "performance", label: "Performance", icon: <BarChart3 className="h-4 w-4" />, kind: "metric" },
  { id: "parse", label: "Parse", icon: <Percent className="h-4 w-4" />, kind: "metric" },
  { id: "peak", label: "Peak", icon: <Crown className="h-4 w-4" />, kind: "rating" },
  { id: "mastery", label: "Mastery", icon: <Layers className="h-4 w-4" />, kind: "rating" },
  { id: "renown", label: "Renown", icon: <Medal className="h-4 w-4" />, kind: "rating" },
]

const BAND_STYLE: Record<Band, { bar: string; label: string; swatch: string }> = {
  ignored: { bar: "bg-muted-foreground/25", label: "Ignored (bottom 20%)", swatch: "bg-muted-foreground/25" },
  floor: { bar: "bg-sky-800", label: "Floor (next 20%)", swatch: "bg-sky-800" },
  form: { bar: "bg-sky-500", label: "Form (the rest)", swatch: "bg-sky-500" },
  peak: { bar: "bg-amber-400", label: "Peak (best kill)", swatch: "bg-amber-400" },
}

const fmt = (n: number, digits = 1) => n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
const fmtInt = (n: number) => Math.round(n).toLocaleString()

export function RatingsPage() {
  const [lens, setLens] = useState<Lens>("mastery")
  const [killCount, setKillCount] = useState(EXAMPLE_KILLS.length)
  const [benchmark, setBenchmark] = useState(TODAY_BENCHMARK)

  const kills = EXAMPLE_KILLS.slice(0, killCount)
  const rating = ratePlayerBoss(kills.map((k) => k.dps), benchmark)
  const bandByIndex = new Map(rating.bands.map((b) => [b.index, b.band]))
  const peakIndex = rating.bands.at(-1)?.index ?? -1

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <ToolsBackLink className="mb-5" />

      <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Understanding your stats</p>
      <h1 className="mb-2 text-3xl font-bold">How Ratings Work</h1>
      <p className="mb-8 max-w-3xl text-muted-foreground">
        Two per-kill numbers describe what you did on one boss kill. Three ratings summarize your whole history on
        a boss, an encounter set, or a group of bosses. Ratings power Chronicle's Peak, Mastery, and Renown
        leaderboards.
      </p>

      <Overview />

      {/* Interactive example */}
      <section className="mb-10">
        <h2 className="mb-1 text-2xl font-semibold">See It in Action</h2>
        <p className="mb-4 text-muted-foreground">
          One example player's Nefarian kills as a Fury Warrior, viewed through each lens.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5" role="tablist" aria-label="Metric lens">
          {LENSES.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={lens === l.id}
              onClick={() => setLens(l.id)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                lens === l.id
                  ? "border-sky-400 bg-sky-500/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {l.icon}
              {l.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
            <LensExplanation lens={lens} rating={rating} benchmark={benchmark} killCount={killCount} />
            <div className="min-w-0">
              <KillChart
                lens={lens}
                kills={kills}
                benchmark={benchmark}
                bandByIndex={bandByIndex}
                peakIndex={peakIndex}
              />
              <label className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="whitespace-nowrap">Kills logged: <strong className="text-foreground tabular-nums">{killCount}</strong></span>
                <input
                  type="range"
                  min={1}
                  max={EXAMPLE_KILLS.length}
                  value={killCount}
                  onChange={(e) => setKillCount(Number(e.target.value))}
                  className="min-w-40 flex-1 accent-sky-500"
                />
              </label>
            </div>
          </div>

          <KillTable kills={kills} lens={lens} bandByIndex={bandByIndex} peakIndex={peakIndex} benchmark={benchmark} />
        </div>
      </section>

      <BenchmarkSection benchmark={benchmark} setBenchmark={setBenchmark} rawPeak={rating.rawPeak} />
      <SmallSamples />
      <MultipleBosses />
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

function Overview() {
  const metrics = [
    { icon: <BarChart3 className="h-5 w-5" />, title: "Performance", body: "Your raw DPS or HPS on one boss kill." },
    {
      icon: <Percent className="h-5 w-5" />,
      title: "Parse",
      body: "That performance scored 0–100 against kills from the 60 days before the raid.",
    },
  ]
  const ratings = [
    { icon: <Crown className="h-5 w-5" />, title: "Peak", body: "Your best kill against the best kill ever recorded in your cohort." },
    {
      icon: <Layers className="h-5 w-5" />,
      title: "Mastery",
      body: "How consistently you perform: your best kill, your typical kills, and your weaker kills, blended.",
    },
    { icon: <Medal className="h-5 w-5" />, title: "Renown", body: "Points for every boss you've killed. It only goes up." },
  ]
  return (
    <section className="mb-10 grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[2fr_auto_3fr] md:items-center">
      <div>
        <h2 className="mb-3 text-sm font-semibold">Per-kill metrics</h2>
        <div className="grid gap-3 sm:grid-cols-2">{metrics.map((m) => <OverviewCard key={m.title} {...m} />)}</div>
      </div>
      <ArrowRight className="mx-auto hidden h-5 w-5 text-muted-foreground md:block" />
      <div>
        <h2 className="mb-3 text-sm font-semibold">
          Ratings <span className="font-normal text-muted-foreground">(your whole history)</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">{ratings.map((m) => <OverviewCard key={m.title} {...m} />)}</div>
      </div>
    </section>
  )
}

function OverviewCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <div className="mb-2 inline-flex rounded-md bg-sky-500/10 p-2 text-sky-400">{icon}</div>
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function LensExplanation({
  lens,
  rating,
  benchmark,
  killCount,
}: {
  lens: Lens
  rating: ReturnType<typeof ratePlayerBoss>
  benchmark: number
  killCount: number
}) {
  switch (lens) {
    case "performance":
      return (
        <div>
          <h3 className="text-xl font-semibold">Performance</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            The DPS or HPS you actually did on each kill. Everything else on this page starts from these numbers.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            The dashed line is the <strong>benchmark</strong>: the best {fmtInt(benchmark)} DPS any Fury Warrior on
            the server has ever done on this boss.
          </p>
        </div>
      )
    case "parse":
      return (
        <div>
          <h3 className="text-xl font-semibold">Parse</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Each kill compared to similar kills from the 60 days before that raid. A parse tells you how one kill
            stacked up at the time.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ratings don't use parses. They go back to your raw performance and compare it to today's all-time
            benchmark. That's why kill #6 parsed 100 but its Peak is lower: someone has beaten it since.
          </p>
        </div>
      )
    case "peak":
      return (
        <div>
          <h3 className="text-xl font-semibold">Peak</h3>
          <p className="mt-2 text-sm text-muted-foreground">Your single best kill, against the benchmark.</p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            100 × {fmtInt(rating.rawPeak)} ÷ {fmtInt(benchmark)}
          </p>
          <Score label="Peak" value={fmt(rating.peak)} />
          <p className="mt-2 text-xs text-muted-foreground">Capped at 100. One great kill is enough.</p>
        </div>
      )
    case "mastery":
      return (
        <div>
          <h3 className="text-xl font-semibold">Mastery</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Sort your kills from worst to best. The worst 20% are ignored. The next 20% are your <strong>Floor</strong>,
            your best kill is your <strong>Peak</strong>, and everything between is your <strong>Form</strong>.
          </p>
          <dl className="mt-3 space-y-1 text-sm tabular-nums">
            <WeightRow label="Peak" weight={MASTERY_WEIGHTS.peak} value={rating.peak} swatch={BAND_STYLE.peak.swatch} />
            <WeightRow label="Form" weight={MASTERY_WEIGHTS.form} value={rating.form} swatch={BAND_STYLE.form.swatch} />
            <WeightRow label="Floor" weight={MASTERY_WEIGHTS.floor} value={rating.floor} swatch={BAND_STYLE.floor.swatch} />
          </dl>
          <Score label="Mastery" value={fmt(rating.mastery)} />
          {killCount < 3 && (
            <p className="mt-2 text-xs text-amber-300">
              With {killCount} {killCount === 1 ? "kill" : "kills"}, some bands are empty and count as 0. See "Few kills"
              below.
            </p>
          )}
        </div>
      )
    case "renown": {
      const nef = killCount * NEFARIAN_AWARD
      const others = OTHER_BWL_BOSSES.reduce((s, b) => s + b.kills * b.award, 0)
      return (
        <div>
          <h3 className="text-xl font-semibold">Renown</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Every boss has a Renown award. Each kill earns that award, however you performed. Harder bosses are worth
            more: Nefarian is worth {NEFARIAN_AWARD}, and the rest of Blackwing Lair is worth 2 each.
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Nefarian: {killCount} kills × {NEFARIAN_AWARD} = {nef}
          </p>
          <Score label="Nefarian Renown" value={String(nef)} />
          <details className="mt-3 text-sm text-muted-foreground">
            <summary className="cursor-pointer">All of Blackwing Lair: {nef + others}</summary>
            <ul className="mt-2 space-y-0.5 text-xs tabular-nums">
              {OTHER_BWL_BOSSES.map((b) => (
                <li key={b.name} className="flex justify-between gap-2">
                  <span className="truncate">{b.name}</span>
                  <span>
                    {b.kills} × {b.award} = {b.kills * b.award}
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-2">
                <span>Nefarian</span>
                <span>
                  {killCount} × {NEFARIAN_AWARD} = {nef}
                </span>
              </li>
            </ul>
          </details>
        </div>
      )
    }
  }
}

function Score({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4">
      <div className="text-sm font-medium text-sky-300">{label}</div>
      <div className="text-5xl font-bold tabular-nums text-sky-200">{value}</div>
    </div>
  )
}

function WeightRow({ label, weight, value, swatch }: { label: string; weight: number; value: number; swatch: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-sm", swatch)} />
      <dt className="w-12">{label}</dt>
      <dd className="text-muted-foreground">
        {Math.round(weight * 100)}% × {fmt(value)} = <span className="text-foreground">{fmt(weight * value)}</span>
      </dd>
    </div>
  )
}

function KillChart({
  lens,
  kills,
  benchmark,
  bandByIndex,
  peakIndex,
}: {
  lens: Lens
  kills: typeof EXAMPLE_KILLS
  benchmark: number
  bandByIndex: Map<number, Band>
  peakIndex: number
}) {
  // Floor the axis so differences between kills stay visible.
  const axisMin = 600
  const axisMax = Math.max(benchmark, ...EXAMPLE_KILLS.map((k) => k.dps)) * 1.1
  const pct = (v: number) => (100 * (v - axisMin)) / (axisMax - axisMin)

  const barClass = (i: number) => {
    switch (lens) {
      case "mastery":
        return BAND_STYLE[bandByIndex.get(i) ?? "form"].bar
      case "peak":
        return i === peakIndex ? "bg-amber-400" : "bg-muted-foreground/25"
      case "renown":
        return "bg-violet-500"
      default:
        return "bg-sky-500"
    }
  }
  const label = (i: number) => {
    const k = kills[i]
    switch (lens) {
      case "parse":
        return <span className={parseColor(k.parse)}>{k.parse}</span>
      case "renown":
        return <span className="text-violet-300">+{NEFARIAN_AWARD}</span>
      case "peak":
        return i === peakIndex ? <span className="text-amber-300">{fmtInt(k.dps)}</span> : null
      default:
        return fmtInt(k.dps)
    }
  }

  return (
    <div>
      <div className="relative h-56">
        <div
          hidden={lens === "renown"}
          className="absolute inset-x-0 border-t border-dashed border-amber-300/60"
          style={{ bottom: `${pct(benchmark)}%` }}
        >
          <span className="absolute -top-5 right-0 text-[11px] text-amber-300/80">
            Benchmark {fmtInt(benchmark)}
          </span>
        </div>
        <div className="flex h-full items-end gap-1 sm:gap-2">
          {EXAMPLE_KILLS.map((k, i) => {
            const shown = i < kills.length
            return (
              <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                {shown && (
                  <>
                    <div className="mb-1 truncate text-center text-[10px] tabular-nums text-muted-foreground sm:text-xs">
                      {label(i)}
                    </div>
                    <div
                      className={cn("rounded-t transition-all", barClass(i))}
                      style={{ height: lens === "renown" ? "60%" : `${pct(k.dps)}%` }}
                      title={`Kill #${i + 1}: ${fmtInt(k.dps)} DPS`}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex gap-1 border-t pt-1 sm:gap-2">
        {EXAMPLE_KILLS.map((_, i) => (
          <div key={i} className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground sm:text-xs">
            #{i + 1}
          </div>
        ))}
      </div>
      {lens === "mastery" && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {(["peak", "form", "floor", "ignored"] as Band[]).map((b) => (
            <span key={b} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-sm", BAND_STYLE[b].swatch)} />
              {BAND_STYLE[b].label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function KillTable({
  kills,
  lens,
  bandByIndex,
  peakIndex,
  benchmark,
}: {
  kills: typeof EXAMPLE_KILLS
  lens: Lens
  bandByIndex: Map<number, Band>
  peakIndex: number
  benchmark: number
}) {
  const dim = (i: number) => (lens === "mastery" && bandByIndex.get(i) === "ignored") || (lens === "peak" && i !== peakIndex)
  return (
    <div className="styled-scrollbar mt-6 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm tabular-nums">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 pr-3 text-left font-medium">Kill</th>
            {kills.map((_, i) => (
              <th key={i} className={cn("px-2 py-2 text-right font-medium", dim(i) && "opacity-40")}>
                #{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 pr-3 text-muted-foreground">Performance (DPS)</td>
            {kills.map((k, i) => (
              <td key={i} className={cn("px-2 py-2 text-right", dim(i) && "opacity-40")}>
                {fmtInt(k.dps)}
              </td>
            ))}
          </tr>
          <tr className="border-b">
            <td className="py-2 pr-3 text-muted-foreground">Parse (at the time)</td>
            {kills.map((k, i) => (
              <td key={i} className={cn("px-2 py-2 text-right", parseColor(k.parse), dim(i) && "opacity-40")}>
                {k.parse}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 pr-3 text-muted-foreground">vs. benchmark today</td>
            {kills.map((k, i) => (
              <td key={i} className={cn("px-2 py-2 text-right", dim(i) && "opacity-40")}>
                {fmt(normalize(k.dps, benchmark))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function BenchmarkSection({
  benchmark,
  setBenchmark,
  rawPeak,
}: {
  benchmark: number
  setBenchmark: (n: number) => void
  rawPeak: number
}) {
  const todayPeak = normalize(rawPeak, TODAY_BENCHMARK)
  const nowPeak = normalize(rawPeak, benchmark)
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
          slider to set a new record and watch the example above update.
        </p>
      </div>
      <div className="rounded-lg border bg-background/40 p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
          <div>
            <div className="mb-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs">Today</div>
            <div className="text-muted-foreground">Benchmark {fmtInt(TODAY_BENCHMARK)}</div>
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
          New server record: <strong className="tabular-nums text-foreground">{fmtInt(benchmark)} DPS</strong>
          <input
            type="range"
            min={TODAY_BENCHMARK}
            max={1500}
            step={10}
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
        <li>
          Each kill counts as DPS or HPS, whichever number is higher. If you play more than one spec, each spec is
          rated separately.
        </li>
        <li>Renown awards can differ by difficulty or raid size. They're set per boss, not by performance.</li>
      </ul>
    </Section>
  )
}
