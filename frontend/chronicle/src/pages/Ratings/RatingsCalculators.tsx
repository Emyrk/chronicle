import { useState, type ReactNode } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { calculateMastery, masteryCeiling } from "@/pages/ArmoryPage/overview/masteryRenownModel"
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes"

const PEAK = METRIC_THEMES.peak
const MASTERY = METRIC_THEMES.mastery

/** Kills per boss that end the Ranked Mastery discount. */
export const FULL_EVIDENCE_KILLS = 5

/** A calculator card: title, one-line purpose, inputs on the left, the result on the right. */
function CalculatorCard({
  id,
  title,
  accent,
  description,
  inputs,
  result,
}: {
  id: string
  title: string
  accent: string
  description: string
  inputs: ReactNode
  result: ReactNode
}) {
  return (
    <section
      id={id}
      aria-label={`${title} calculator`}
      className="scroll-mt-20 overflow-hidden rounded-xl border bg-card"
      style={{ boxShadow: `inset 0 2px 0 ${accent}` }}
    >
      <div className="border-b px-5 py-4">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-[1fr_minmax(0,18rem)]">
        <div className="space-y-5">{inputs}</div>
        <div className="rounded-lg border bg-black/20 p-4">{result}</div>
      </div>
    </section>
  )
}

function Slider({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  format = (v: number) => v.toFixed(0),
  accent,
}: {
  label: string
  hint: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  format?: (value: number) => string
  accent: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-4">
        <span>
          <span className="text-sm font-medium">{label}</span>
          <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
        </span>
        <span className="font-mono text-base tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-black/40"
        style={{ accentColor: accent }}
      />
    </label>
  )
}

function ResultLine({ label, value, strong, color }: { label: string; value: ReactNode; strong?: boolean; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={cn("text-sm", strong ? "font-medium" : "text-muted-foreground")}>{label}</span>
      <span className={cn("font-mono tabular-nums", strong ? "text-2xl" : "text-sm")} style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  )
}

/** Evidence as the leaderboards show it: a percentage, or a check once five kills are in. */
export function EvidenceBadge({ kills }: { kills: number }) {
  const percent = Math.round((Math.min(kills, FULL_EVIDENCE_KILLS) / FULL_EVIDENCE_KILLS) * 100)
  return percent >= 100 ? (
    <span className="inline-flex items-center gap-1 text-green-500" aria-label="Evidence complete">
      <Check className="size-4" />
      complete
    </span>
  ) : (
    <span className="font-mono tabular-nums">{percent}%</span>
  )
}

/**
 * Ranked Mastery from its parts, with the same model the leaderboards use: the estimate is
 * 35% Peak + 50% Form + 15% Floor, discounted until five kills.
 */
export function MasteryCalculator({
  initial = { peak: 96, form: 88, floor: 79, kills: 3 },
}: {
  initial?: { peak: number; form: number; floor: number; kills: number }
}) {
  const [peak, setPeak] = useState(initial.peak)
  const [form, setForm] = useState(initial.form)
  const [floor, setFloor] = useState(initial.floor)
  const [kills, setKills] = useState(initial.kills)
  const m = calculateMastery({ peak, form, floor, kills })
  return (
    <CalculatorCard
      id="mastery-calculator"
      title="Ranked Mastery"
      accent={MASTERY.accent}
      description="Move the sliders to see how Peak, Form, Floor, and kills combine on one boss."
      inputs={
        <>
          <Slider label="Peak" hint="your best parse" value={peak} onChange={setPeak} accent={PEAK.accent} />
          <Slider label="Form" hint="your typical parse" value={form} onChange={setForm} accent={MASTERY.accent} />
          <Slider label="Floor" hint="your weaker nights" value={floor} onChange={setFloor} accent={MASTERY.accent} />
          <Slider label="Kills" hint="on this boss" value={kills} onChange={setKills} min={1} max={10} accent={MASTERY.accent} />
        </>
      }
      result={
        <>
          <p className="mb-3 font-mono text-xs text-muted-foreground">
            0.35 × {peak} + 0.5 × {form} + 0.15 × {floor}
          </p>
          <ResultLine label="Mastery estimate" value={m.estimate.toFixed(1)} />
          <ResultLine label="Evidence" value={<EvidenceBadge kills={kills} />} />
          <ResultLine label="Ranking weight" value={`${Math.round(m.rankingMultiplier * 100)}%`} />
          <div className="my-2 border-t" />
          <ResultLine label="Ranked Mastery" value={m.rankedMastery.toFixed(1)} strong color={MASTERY.accent} />
          {kills < FULL_EVIDENCE_KILLS && (
            <p className="mt-2 text-xs text-muted-foreground">
              {FULL_EVIDENCE_KILLS - kills} more {FULL_EVIDENCE_KILLS - kills === 1 ? "kill" : "kills"} at this level would make it{" "}
              {m.estimate.toFixed(1)}.
            </p>
          )}
        </>
      }
    />
  )
}

/** How the ranking weight grows with kills: the five bars of evidence. */
export function EvidenceChart() {
  const counts = [1, 2, 3, 4, 5, 6]
  return (
    <figure className="rounded-xl border bg-card p-5" aria-label="Ranking weight by kills">
      <div className="flex items-end gap-3" style={{ height: 140 }}>
        {counts.map((k) => {
          const weight = masteryCeiling(k)
          const full = k >= FULL_EVIDENCE_KILLS
          return (
            <div key={k} className="flex flex-1 flex-col items-center justify-end gap-1.5" style={{ height: "100%" }}>
              <span className="font-mono text-xs tabular-nums">{Math.round(weight)}%</span>
              <div
                className="w-full rounded-t-md"
                style={{
                  height: `${weight}%`,
                  backgroundColor: full ? "rgb(34 197 94 / 0.55)" : `color-mix(in srgb, ${MASTERY.accent} 55%, transparent)`,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-3 border-t pt-2">
        {counts.map((k) => (
          <span key={k} className="flex-1 text-center text-xs text-muted-foreground">
            {k === 6 ? "6+" : k} {k === 1 ? "kill" : "kills"}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">
        The most Ranked Mastery a perfect record can earn at each kill count. From five kills on, nothing is held back.
      </figcaption>
    </figure>
  )
}

/** Peak on a boss: your best raw DPS against the current #1, which can move. */
export function PeakCalculator() {
  const [yours, setYours] = useState(1200)
  const [top, setTop] = useState(1300)
  const [record, setRecord] = useState(1400)
  const peak = (n: number) => (Math.min(yours, n) / n) * 100
  return (
    <CalculatorCard
      id="peak-calculator"
      title="Peak"
      accent={PEAK.accent}
      description="Peak is your best kill measured against the current #1. Raise the #1's record to see every other Peak drop."
      inputs={
        <>
          <Slider label="Your best kill" hint="DPS or HPS" value={yours} onChange={setYours} min={300} max={2000} step={10} accent={PEAK.accent} />
          <Slider
            label="Current #1"
            hint="best kill of your spec"
            value={top}
            onChange={(v) => {
              setTop(v)
              if (record < v) setRecord(v)
            }}
            min={300}
            max={2000}
            step={10}
            accent={PEAK.accent}
          />
          <Slider
            label="A new #1 record"
            hint="if someone beats it"
            value={record}
            onChange={(v) => setRecord(Math.max(v, top))}
            min={300}
            max={2500}
            step={10}
            accent={PEAK.accent}
          />
        </>
      }
      result={
        <>
          <p className="mb-3 font-mono text-xs text-muted-foreground">
            {yours.toLocaleString()} ÷ {top.toLocaleString()} × 100
          </p>
          <ResultLine label="Your Peak" value={peak(top).toFixed(1)} strong color={PEAK.accent} />
          <ResultLine label="After the new record" value={peak(record).toFixed(1)} />
          <p className="mt-2 text-xs text-muted-foreground">
            {yours >= top ? "You are the #1: your Peak is 100 until someone beats you." : "Your kill did not change; the bar did."}
          </p>
        </>
      }
    />
  )
}

/** Raid Peak: the average of every boss's Peak, optional bosses included, a missed boss counting as zero. */
export function RaidPeakCalculator({ bosses = 12 }: { bosses?: number }) {
  const [killed, setKilled] = useState(bosses - 1)
  const [average, setAverage] = useState(95)
  const raidPeak = (average * killed) / bosses
  return (
    <CalculatorCard
      id="raid-peak-calculator"
      title="Raid Peak"
      accent={PEAK.accent}
      description={`A single raid's Peak averages your Peak on all ${bosses} bosses. A boss you have not killed counts as zero.`}
      inputs={
        <>
          <Slider label="Bosses killed" hint={`of ${bosses}`} value={killed} onChange={setKilled} min={0} max={bosses} accent={PEAK.accent} />
          <Slider label="Average Peak" hint="on the bosses you killed" value={average} onChange={setAverage} min={0} max={100} accent={PEAK.accent} />
        </>
      }
      result={
        <>
          <p className="mb-3 font-mono text-xs text-muted-foreground">
            ({average} × {killed} + 0 × {bosses - killed}) ÷ {bosses}
          </p>
          <ResultLine label="Raid Peak" value={raidPeak.toFixed(1)} strong color={PEAK.accent} />
          {killed < bosses && (
            <p className="mt-2 text-xs text-muted-foreground">
              Killing the {bosses - killed === 1 ? "missing boss" : `${bosses - killed} missing bosses`} at the same level would make it{" "}
              {average.toFixed(1)}.
            </p>
          )}
        </>
      }
    />
  )
}

function clock(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`
}

/** Guild Peak on a boss: the guild's kill time against the fastest kill, the fastest scoring 100. */
export function GuildPeakCalculator() {
  const [fastest, setFastest] = useState(2 * 60 + 10)
  const [yours, setYours] = useState(2 * 60 + 35)
  const score = (fastest / Math.max(yours, fastest)) * 100
  return (
    <CalculatorCard
      id="guild-peak-calculator"
      title="Guild Peak"
      accent={PEAK.accent}
      description="A guild's kill is scored by its time: the fastest kill of that boss on the server is 100, and a kill twice as long scores 50."
      inputs={
        <>
          <Slider
            label="Fastest kill"
            hint="of this boss on the server"
            value={fastest}
            onChange={(v) => {
              setFastest(v)
              if (yours < v) setYours(v)
            }}
            min={30}
            max={6 * 60}
            step={1}
            format={clock}
            accent={PEAK.accent}
          />
          <Slider
            label="Your kill"
            hint="your guild's kill time"
            value={yours}
            onChange={(v) => setYours(Math.max(v, fastest))}
            min={30}
            max={10 * 60}
            step={1}
            format={clock}
            accent={PEAK.accent}
          />
        </>
      }
      result={
        <>
          <p className="mb-3 font-mono text-xs text-muted-foreground">
            {clock(fastest)} ÷ {clock(yours)} × 100
          </p>
          <ResultLine label="Guild Peak" value={score.toFixed(1)} strong color={PEAK.accent} />
          <p className="mt-2 text-xs text-muted-foreground">
            A single raid's guild Peak averages every boss. Guild Mastery and Renown then use the same rules as characters.
          </p>
        </>
      }
    />
  )
}
