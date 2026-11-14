import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ratePlayerBoss } from "./ratingMath"
import { LensQuestion, Score } from "./BossCalculator"
import { BAND_STYLE, LENSES, RATING_ACCENT, fmt, fmtInt, type Lens } from "./ratingLens"
import type { RaidBoss, RaidView } from "./useMyRatingData"

/** Raid lens copy: per-kill numbers belong to one boss; ratings average or add up across bosses. */
function RaidExplanation({ lens, view }: { lens: Lens; view: RaidView }) {
  const n = view.bosses.length
  const killed = view.bosses.filter((b) => b.kills > 0).length
  const title = LENSES.find((l) => l.id === lens)?.label
  const average = (field: "peak" | "mastery", value: number) => (
    <>
      <p className="mt-2 text-sm text-muted-foreground">
        A raid's {title} is the <strong>average of every boss's {title}</strong>, all weighted equally. A boss without a{" "}
        {view.unit} kill as {view.scope.label} counts as 0
        {killed < n ? ` (${n - killed} here)` : ""}.
      </p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {view.bosses.map((b) => fmt(b[field])).join(" + ")} ÷ {n}
      </p>
      <Score label={`${view.raidLabel} ${title}`} value={fmt(value)} />
    </>
  )
  return (
    <div className="max-w-3xl">
      <h3 className="text-xl font-semibold">{title}</h3>
      <LensQuestion lens={lens} />
      {lens === "performance" || lens === "parse" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {title} describes one kill, so it has no raid total. Pick a boss to see each kill's{" "}
          {lens === "parse" ? "parse" : view.unit}. The table shows each boss's best {view.unit} against its benchmark.
        </p>
      ) : lens === "peak" ? (
        average("peak", view.peak)
      ) : lens === "mastery" ? (
        average("mastery", view.mastery)
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Renown adds up: every kill of every boss earns that boss's award, whichever metric it was rated on.
          </p>
          <Score label={`${view.raidLabel} Renown`} value={fmtInt(view.renown)} />
        </>
      )}
    </div>
  )
}

/** One small bar per kill, coloured like the boss chart for the current lens. */
function BossKillBars({ boss, lens, onSelect }: { boss: RaidBoss; lens: Lens; onSelect?: () => void }) {
  if (boss.values.length === 0) return <span className="text-muted-foreground">{boss.kills}</span>
  const rating = ratePlayerBoss(boss.values, boss.benchmark)
  const bands = new Map(rating.bands.map((b) => [b.index, b.band]))
  const peakIndex = rating.bands.at(-1)?.index ?? -1
  // Same axis as the boss chart: floored so differences between kills stay visible.
  const axisMin = Math.max(0, Math.min(...boss.values) * 0.75)
  const axisMax = Math.max(boss.benchmark, ...boss.values)
  const pct = (v: number) => (axisMax > axisMin ? (100 * (v - axisMin)) / (axisMax - axisMin) : 100)
  const color = (i: number) => {
    switch (lens) {
      case "mastery":
        return BAND_STYLE[bands.get(i) ?? "form"].bar
      case "peak":
        return i === peakIndex ? "bg-amber-400" : "bg-muted-foreground/25"
      case "renown":
        return "bg-violet-500"
      default:
        return "bg-sky-500"
    }
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 ring-1 ring-transparent transition-colors hover:bg-sky-500/10 hover:ring-sky-400/40"
      title={`See ${boss.encounterName}'s ${boss.values.length} kills`}
      aria-label={`See ${boss.encounterName}'s ${boss.values.length} kills`}
    >
      <span
        className={cn(
          "flex h-8 w-32 origin-bottom items-end border-b border-border transition-transform duration-150 group-hover:scale-y-125",
 boss.values.length > 20 ? "gap-px" : "gap-0.5",
        )}
      >
        {boss.values.map((v, i) => (
          <span
            key={i}
            className={cn("min-w-px flex-1 rounded-t-sm", color(i))}
            style={{ height: lens === "renown" ? "60%" : `${Math.max(pct(v), 6)}%` }}
          />
        ))}
      </span>
      <span className="w-4 text-right text-muted-foreground group-hover:text-foreground">{boss.kills}</span>
      <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-sky-300 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
    </button>
  )
}

export function RaidPanel({ lens, view, onSelectBoss }: { lens: Lens; view: RaidView; onSelectBoss: (key: string) => void }) {
  const n = view.bosses.length
  // The lens's column is highlighted; per-kill lenses highlight raw performance.
  const hi = (col: "best" | "peak" | "mastery" | "renown") =>
    (col === "best" && (lens === "performance" || lens === "parse")) || col === lens ? "bg-sky-500/10" : ""
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6">
      {/* Stacked, not side by side: the boss table needs the full width. */}
      <div className="space-y-6">
        <RaidExplanation lens={lens} view={view} />
        <div className="styled-scrollbar min-w-0 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm tabular-nums">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3 text-left font-medium">Boss</th>
                <th className="px-1.5 py-2 text-left font-medium">Kills</th>
                <th className="px-1.5 py-2 text-right font-medium">Benchmark</th>
                <th className={cn("px-1.5 py-2 text-right font-medium", hi("best"))}>Best {view.unit}</th>
                <th className={cn("px-1.5 py-2 text-right font-medium", hi("peak"))}>Peak</th>
                <th className="px-1.5 py-2 text-right font-medium">Form</th>
                <th className="px-1.5 py-2 text-right font-medium">Floor</th>
                <th className={cn("px-1.5 py-2 text-right font-medium", hi("mastery"))}>Mastery</th>
                <th className={cn("px-1.5 py-2 text-right font-medium", hi("renown"))}>Renown</th>
              </tr>
            </thead>
            <tbody>
              {view.bosses.map((b) => {
                const has = b.kills > 0
                const dash = <span className="text-muted-foreground">—</span>
                return (
                  <tr key={b.encounterName} className="border-b">
                    <td className="py-2 pr-3">
                      {b.groupKey ? (
                        <button
                          type="button"
                          onClick={() => onSelectBoss(b.encounterName)}
                          className="text-left text-sky-300 hover:text-sky-200 hover:underline"
                          title="See this boss's kills"
                        >
                          {b.encounterName}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">{b.encounterName}</span>
                      )}
                    </td>
                    <td className="px-1.5 py-2">
                      <BossKillBars boss={b} lens={lens} onSelect={b.groupKey ? () => onSelectBoss(b.encounterName) : undefined} />
                    </td>
                    <td className="px-1.5 py-2 text-right text-muted-foreground">{has ? fmtInt(b.benchmark) : dash}</td>
                    <td className={cn("px-1.5 py-2 text-right", hi("best"))}>{has ? fmtInt(b.rawPeak) : dash}</td>
                    <td className={cn("px-1.5 py-2 text-right", hi("peak"))} style={{ color: RATING_ACCENT.peak }}>
                      {fmt(b.peak)}
                    </td>
                    <td className="px-1.5 py-2 text-right text-muted-foreground">{has ? fmt(b.form) : dash}</td>
                    <td className="px-1.5 py-2 text-right text-muted-foreground">{has ? fmt(b.floor) : dash}</td>
                    <td className={cn("px-1.5 py-2 text-right font-semibold", hi("mastery"))} style={{ color: RATING_ACCENT.mastery }}>
                      {fmt(b.mastery)}
                    </td>
                    <td className={cn("px-1.5 py-2 text-right", hi("renown"))} style={{ color: RATING_ACCENT.renown }}>
                      {fmtInt(b.renown)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-2 pr-3" colSpan={4}>
                  Raid <span className="font-normal text-muted-foreground">(Peak and Mastery ÷ {n}, Renown summed)</span>
                </td>
                <td className={cn("px-1.5 py-2 text-right", hi("peak"))} style={{ color: RATING_ACCENT.peak }}>
                  {fmt(view.peak)}
                </td>
                <td colSpan={2} />
                <td className={cn("px-1.5 py-2 text-right", hi("mastery"))} style={{ color: RATING_ACCENT.mastery }}>
                  {fmt(view.mastery)}
                </td>
                <td className={cn("px-1.5 py-2 text-right", hi("renown"))} style={{ color: RATING_ACCENT.renown }}>
                  {fmtInt(view.renown)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Click a boss or its kill bars to see how its kills fill the Peak, Form, and Floor bands. Bosses with no {view.unit} kills
            count as 0. Boss values are recomputed here for illustration and can differ slightly from the server's totals.
          </p>
        </div>
      </div>
    </div>
  )
}
