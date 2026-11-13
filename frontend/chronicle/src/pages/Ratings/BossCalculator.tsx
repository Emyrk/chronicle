import { useState } from "react"
import { cn } from "@/lib/utils"
import { parseColor } from "@/pages/Instance/parseColors"
import { MASTERY_WEIGHTS, normalize, ratePlayerBoss, type Band } from "./ratingMath"
import { BAND_STYLE, LENSES, QUESTION, RATING_ACCENT, fmt, fmtDate, fmtInt, type Lens } from "./ratingLens"
import type { RatingDataset } from "./useMyRatingData"

const OTHER_BWL_BOSSES = [
  { name: "Razorgore the Untamed", kills: 12, award: 2 },
  { name: "Vaelastrasz the Corrupt", kills: 12, award: 2 },
  { name: "Broodlord Lashlayer", kills: 11, award: 2 },
  { name: "Firemaw", kills: 11, award: 2 },
  { name: "Ebonroc", kills: 11, award: 2 },
  { name: "Flamegor", kills: 11, award: 2 },
  { name: "Chromaggus", kills: 10, award: 2 },
]
/** Above this many kills, per-bar value labels would overlap. */
const MAX_LABELLED_BARS = 14

/** The lens buttons above the calculator. */
export function LensTabs({
  lens,
  onChange,
  compact,
  only,
}: {
  lens: Lens
  onChange: (lens: Lens) => void
  compact?: boolean
  /** Limit the tabs, e.g. to the ratings where per-kill metrics are shown elsewhere. */
  only?: readonly Lens[]
}) {
  const lenses = only ? LENSES.filter((l) => only.includes(l.id)) : LENSES
  return (
    <div
      className={cn("grid gap-2", lenses.length === 5 ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-3", compact ? "mb-3" : "mb-4")}
      role="tablist"
      aria-label="Metric lens"
    >
      {lenses.map((l) => (
        <button
          key={l.id}
          type="button"
          role="tab"
          aria-selected={lens === l.id}
          onClick={() => onChange(l.id)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
            compact ? "py-1.5" : "py-2.5",
            lens === l.id
              ? "border-sky-400 bg-sky-500/10 text-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <l.Icon className="h-4 w-4" style={l.accent ? { color: l.accent } : undefined} />
          {l.label}
        </button>
      ))}
    </div>
  )
}

/** One boss's kills through a lens: explanation, kill chart with a kills-logged slider, and the kill table. */
export function BossCalculator({
  lens,
  dataset,
  killCount,
  setKillCount,
  benchmark,
}: {
  lens: Lens
  dataset: RatingDataset
  killCount: number
  setKillCount: (n: number) => void
  benchmark: number
}) {
  const kills = dataset.kills.slice(0, killCount)
  const rating = ratePlayerBoss(kills.map((k) => k.value), benchmark)
  const bandByIndex = new Map(rating.bands.map((b) => [b.index, b.band]))
  const peakIndex = rating.bands.at(-1)?.index ?? -1
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <LensExplanation lens={lens} rating={rating} dataset={dataset} benchmark={benchmark} killCount={killCount} />
        <div className="min-w-0">
          <KillChart
            lens={lens}
            dataset={dataset}
            killCount={killCount}
            benchmark={benchmark}
            bandByIndex={bandByIndex}
            peakIndex={peakIndex}
          />
          <label className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">
              Kills logged: <strong className="text-foreground tabular-nums">{killCount}</strong>
            </span>
            <input
              type="range"
              min={1}
              max={dataset.kills.length}
              value={killCount}
              disabled={dataset.kills.length < 2}
              onChange={(e) => setKillCount(Number(e.target.value))}
              className="min-w-40 flex-1 accent-sky-500"
            />
          </label>
        </div>
      </div>

      <KillTable
        kills={kills}
        unit={dataset.unit}
        lens={lens}
        bandByIndex={bandByIndex}
        peakIndex={peakIndex}
        benchmark={benchmark}
      />
    </>
  )
}

/** BossCalculator with its own lens and slider state, for embedding outside the ratings page. */
export function StandaloneBossCalculator({
  dataset,
  initialLens = "mastery",
  lenses,
}: {
  dataset: RatingDataset
  initialLens?: Lens
  lenses?: readonly Lens[]
}) {
  const [lens, setLens] = useState<Lens>(initialLens)
  const [killCount, setKillCount] = useState(dataset.kills.length)
  return (
    <>
      <LensTabs lens={lens} onChange={setLens} compact only={lenses} />
      <BossCalculator lens={lens} dataset={dataset} killCount={killCount} setKillCount={setKillCount} benchmark={dataset.benchmark} />
    </>
  )
}

export function LensQuestion({ lens }: { lens: Lens }) {
  const accent = lens === "peak" || lens === "mastery" || lens === "renown" ? RATING_ACCENT[lens] : undefined
  return (
    <p className="mt-1 text-sm font-medium italic" style={accent ? { color: accent } : undefined}>
      {QUESTION[lens]}
    </p>
  )
}

function LensExplanation({
  lens,
  rating,
  dataset,
  benchmark,
  killCount,
}: {
  lens: Lens
  rating: ReturnType<typeof ratePlayerBoss>
  dataset: RatingDataset
  benchmark: number
  killCount: number
}) {
  const { unit, cohortLabel, bossName, award } = dataset
  switch (lens) {
    case "performance":
      return (
        <div>
          <h3 className="text-xl font-semibold">Performance</h3>
          <LensQuestion lens="performance" />
          <p className="mt-2 text-sm text-muted-foreground">
            The {unit} {dataset.example ? "" : "you "}actually did on each kill. Everything else on this page starts
            from these numbers.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            The dashed line is the <strong>benchmark</strong>: the best {fmtInt(benchmark)} {unit} any {cohortLabel} on
            the server has ever done on {bossName}.
          </p>
        </div>
      )
    case "parse":
      return (
        <div>
          <h3 className="text-xl font-semibold">Parse</h3>
          <LensQuestion lens="parse" />
          <p className="mt-2 text-sm text-muted-foreground">
            Each kill compared to similar kills from the 60 days before that raid. A parse tells you how one kill
            stacked up at the time.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ratings don't use parses. They go back to your raw performance and compare it to today's all-time
            benchmark.{" "}
            {dataset.example
              ? "That's why kill #6 parsed 100 but its Peak is lower: someone has beaten it since."
              : "A kill that parsed 100 can still have a Peak below 100 if someone has beaten it since."}
          </p>
        </div>
      )
    case "peak":
      return (
        <div>
          <h3 className="text-xl font-semibold">Peak</h3>
          <LensQuestion lens="peak" />
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
          <LensQuestion lens="mastery" />
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
      // The example scales with the slider; real Renown counts every kill of the boss.
      const renownKills = dataset.example ? killCount : dataset.renownKills
      const points = renownKills * award
      const others = OTHER_BWL_BOSSES.reduce((s, b) => s + b.kills * b.award, 0)
      return (
        <div>
          <h3 className="text-xl font-semibold">Renown</h3>
          <LensQuestion lens="renown" />
          <p className="mt-2 text-sm text-muted-foreground">
            Every boss has a Renown award. Each kill earns that award, however you performed. Harder bosses are worth
            more:{" "}
            {dataset.example
              ? `Nefarian is worth ${award}, and the rest of Blackwing Lair is worth 2 each.`
              : `${bossName} is worth ${fmtInt(award)} per kill here.`}
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {bossName}: {renownKills} kills × {fmtInt(award)} = {fmtInt(points)}
          </p>
          <Score label={`${bossName} Renown`} value={fmtInt(points)} />
          {!dataset.example && renownKills > dataset.kills.length && (
            <p className="mt-2 text-xs text-muted-foreground">
              Includes kills as another spec or counted as {unit === "DPS" ? "HPS" : "DPS"}. Renown counts every kill
              once.
            </p>
          )}
          {dataset.example && (
            <details className="mt-3 text-sm text-muted-foreground">
              <summary className="cursor-pointer">All of Blackwing Lair: {points + others}</summary>
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
                    {renownKills} × {award} = {points}
                  </span>
                </li>
              </ul>
            </details>
          )}
        </div>
      )
    }
  }
}

export function Score({ label, value }: { label: string; value: string }) {
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
  dataset,
  killCount,
  benchmark,
  bandByIndex,
  peakIndex,
}: {
  lens: Lens
  dataset: RatingDataset
  killCount: number
  benchmark: number
  bandByIndex: Map<number, Band>
  peakIndex: number
}) {
  const all = dataset.kills
  // Floor the axis so differences between kills stay visible.
  const axisMin = Math.max(0, Math.min(...all.map((k) => k.value)) * 0.75)
  const axisMax = Math.max(benchmark, ...all.map((k) => k.value)) * 1.1
  const pct = (v: number) => (100 * (v - axisMin)) / (axisMax - axisMin)
  const labelled = all.length <= MAX_LABELLED_BARS

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
    const k = all[i]
    switch (lens) {
      case "parse":
        return k.parse === undefined ? "—" : <span className={parseColor(k.parse)}>{k.parse}</span>
      case "renown":
        return <span className="text-violet-300">+{fmtInt(dataset.award)}</span>
      case "peak":
        return i === peakIndex ? <span className="text-amber-300">{fmtInt(k.value)}</span> : null
      default:
        return fmtInt(k.value)
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
        <div className={cn("flex h-full items-end", all.length > 20 ? "gap-px" : "gap-1 sm:gap-2")}>
          {all.map((k, i) => {
            const shown = i < killCount
            return (
              <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                {shown && (
                  <>
                    {(labelled || (lens === "peak" && i === peakIndex)) && (
                      <div className="mb-1 truncate text-center text-[10px] tabular-nums text-muted-foreground sm:text-xs">
                        {label(i)}
                      </div>
                    )}
                    <div
                      className={cn("rounded-t transition-all", barClass(i))}
                      style={{ height: lens === "renown" ? "60%" : `${pct(k.value)}%` }}
                      title={`Kill #${i + 1}${k.killedAt ? ` (${fmtDate(k.killedAt)})` : ""}: ${fmtInt(k.value)} ${dataset.unit}${k.parse === undefined ? "" : `, parse ${k.parse}`}`}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className={cn("flex border-t pt-1", all.length > 20 ? "gap-px" : "gap-1 sm:gap-2")}>
        {all.map((_, i) => (
          <div key={i} className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground sm:text-xs">
            {labelled || i === 0 || i === all.length - 1 || (i + 1) % 10 === 0 ? `#${i + 1}` : ""}
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
  unit,
  lens,
  bandByIndex,
  peakIndex,
  benchmark,
}: {
  kills: RatingDataset["kills"]
  unit: RatingDataset["unit"]
  lens: Lens
  bandByIndex: Map<number, Band>
  peakIndex: number
  benchmark: number
}) {
  const dim = (i: number) => (lens === "mastery" && bandByIndex.get(i) === "ignored") || (lens === "peak" && i !== peakIndex)
  const dated = kills.some((k) => k.killedAt)
  return (
    <div className="styled-scrollbar mt-6 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm tabular-nums">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="sticky left-0 bg-card py-2 pr-3 text-left font-medium">Kill</th>
            {kills.map((k, i) => (
              <th key={i} className={cn("px-2 py-2 text-right font-medium", dim(i) && "opacity-40")} title={fmtDate(k.killedAt)}>
                #{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dated && (
            <tr className="border-b">
              <td className="sticky left-0 bg-card py-2 pr-3 text-muted-foreground">Date</td>
              {kills.map((k, i) => (
                <td key={i} className={cn("whitespace-nowrap px-2 py-2 text-right text-xs text-muted-foreground", dim(i) && "opacity-40")}>
                  {k.killedAt ? new Date(k.killedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                </td>
              ))}
            </tr>
          )}
          <tr className="border-b">
            <td className="sticky left-0 bg-card py-2 pr-3 text-muted-foreground">Performance ({unit})</td>
            {kills.map((k, i) => (
              <td key={i} className={cn("px-2 py-2 text-right", dim(i) && "opacity-40")}>
                {fmtInt(k.value)}
              </td>
            ))}
          </tr>
          <tr className="border-b">
            <td className="sticky left-0 bg-card py-2 pr-3 text-muted-foreground">Parse (at the time)</td>
            {kills.map((k, i) => (
              <td
                key={i}
                className={cn("px-2 py-2 text-right", k.parse === undefined ? "text-muted-foreground" : parseColor(k.parse), dim(i) && "opacity-40")}
              >
                {k.parse ?? "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="sticky left-0 bg-card py-2 pr-3 text-muted-foreground">vs. benchmark today</td>
            {kills.map((k, i) => (
              <td key={i} className={cn("px-2 py-2 text-right", dim(i) && "opacity-40")}>
                {fmt(normalize(k.value, benchmark))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
