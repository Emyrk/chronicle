import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { calculateMastery } from "@/pages/ArmoryPage/overview/masteryRenownModel"
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes"
import {
  EvidenceBadge,
  EvidenceChart,
  GuildPeakCalculator,
  MasteryCalculator,
  PeakCalculator,
  RaidPeakCalculator,
  RenownCalculator,
} from "./RatingsCalculators"

const PEAK = METRIC_THEMES.peak
const MASTERY = METRIC_THEMES.mastery
const RENOWN = METRIC_THEMES.renown

const SECTIONS = [
  { id: "basics", label: "The basics" },
  { id: "peak", label: "Peak" },
  { id: "mastery", label: "Ranked Mastery" },
  { id: "renown", label: "Renown" },
  { id: "guilds", label: "Guild ratings" },
  { id: "fairness", label: "Fairness and limits" },
]

/**
 * /ratings/faq: what Peak, Ranked Mastery, and Renown mean, how each is calculated, and how to read
 * the leaderboards, with calculators that run the same model the leaderboards use.
 */
export function RatingsFaqPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 max-w-3xl">
        <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">Leaderboards</p>
        <h1 className="mb-3 font-wow text-4xl">How ratings work</h1>
        <p className="text-muted-foreground">
          A parse tells you how one kill went. Ratings look at all of your kills and answer three different questions: how high you have reached, what
          you reliably deliver, and what your career adds up to. Each gets its own number, because one number cannot answer all three honestly.
        </p>
      </header>

      <div className="mb-10 grid gap-4 md:grid-cols-3">
        <MetricIntro
          metric="peak"
          question="How high have you reached?"
          body="Your best kill on each boss, measured against the current #1. One great kill is enough."
        />
        <MetricIntro
          metric="mastery"
          question="What do you reliably deliver?"
          body="Your typical play, your best, and your weaker nights together."
        />
        <MetricIntro
          metric="renown"
          question="What has your career added up to?"
          body="Bosses killed, how often you return, and full clears. It never looks at your parses."
        />
      </div>

      <div className="grid gap-10 lg:grid-cols-[12rem_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-6 space-y-1 text-sm">
            <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">On this page</p>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                {s.label}
              </a>
            ))}
            <p className="mt-4 mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Calculators</p>
            {[
              ["mastery-calculator", "Ranked Mastery"],
              ["peak-calculator", "Peak"],
              ["raid-peak-calculator", "Raid Peak"],
              ["renown-calculator", "Renown"],
              ["guild-peak-calculator", "Guild Peak"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="block rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-12">
          <Section id="basics" title="The basics">
            <Faq q="How is a rating different from a parse?" open>
              <p>
                A <strong>parse</strong> is a 0–100 score for one kill: your DPS or HPS compared with your spec on the same boss, difficulty, and raid
                size. <a href="/parsing">How parses work</a> explains how the score is computed and how to read it. Ratings are built from your parses
                and span many raid nights.
              </p>
            </Faq>
            <Faq q="Why three numbers instead of one?">
              <p>
                Because they answer different questions, and mixing them hides the answer you came for. A player with one perfect kill and a player
                who parses 90 every week are both impressive, in different ways. Peak celebrates the first, Ranked Mastery the second, and Renown
                rewards showing up for years. Folding them into one score would make each of them harder to read.
              </p>
            </Faq>
            <Faq q="Who am I compared against?">
              <p>
                Parses compare you with your own <strong>spec on the same boss</strong>, and with your <a href="/subspecs">subspec</a> where one
                exists, so a Feral (Bear) is not ranked against Feral (Cat) damage. Ratings are calculated across the <strong>whole server</strong>,
                every realm together. The realm picker at the top of the leaderboards only filters who is listed, so a player keeps the same rating
                whichever realm you view; your choice is remembered for your next visit.
              </p>
            </Faq>
            <Faq q="Which kills count, and for how long?">
              <p>
                Every eligible boss kill counts, even when the rest of the raid was not logged. A kill uploaded twice counts once. The leaderboards
                show the <strong>last 180 days</strong> by default, so the ladders reflect current play. Switch to <strong>All time</strong> to see
                every eligible kill Chronicle has recorded.
              </p>
            </Faq>
            <Faq q="Where do I find them?">
              <p>
                On the <a href="/leaderboards">leaderboards</a>. Each instance has a Ratings tab with a board for Peak, Ranked Mastery, and Renown, a
                card for every boss, and a full table you can search and sort. Use the class icons to narrow to one class, spec, or subspec.
              </p>
            </Faq>
          </Section>

          <Section id="peak" title="Peak" accent={PEAK.accent} icon={<PEAK.icon className="size-5" style={{ color: PEAK.accent }} />}>
            <Faq q="What is Peak?" open>
              <p>
                Your <strong>best kill</strong> on a boss, measured against the <strong>current #1</strong> of your spec: your best raw DPS (or HPS)
                divided by the #1's, times 100. The #1 holds 100. It is the one-shot, min-max rating: one great night is enough.
              </p>
            </Faq>
            <Faq q="Why did my Peak go down when I did not play?">
              <p>
                Because the #1 is a moving target. When someone sets a new record, everyone else is now measured against a higher bar, so every other
                Peak on that boss drops a little. Your best kill has not changed; beat your own record to climb back.
              </p>
              <Example
                title="Example: a new #1"
                rows={[
                  ["Your best kill", "1,200 DPS"],
                  ["#1 at 1,300 DPS", "1,200 ÷ 1,300 = 92.3"],
                  ["#1 improves to 1,400 DPS", "1,200 ÷ 1,400 = 85.7"],
                ]}
              />
            </Faq>
            <PeakCalculator />
            <Faq q="How is a raid's Peak calculated?">
              <p>
                It averages your Peak on <strong>every boss in the raid</strong>. A boss you have not killed counts as zero, so a raid Peak rewards a
                full set of strong kills, not three great ones.
              </p>
              <Example
                title="Example: one boss short"
                rows={[
                  ["Peak on 11 bosses", "95 each"],
                  ["Peak on the 12th", "not killed: 0"],
                  ["Raid Peak", "(95 × 11 + 0) ÷ 12 = 87.1"],
                ]}
              />
            </Faq>
            <RaidPeakCalculator />
            <Faq q="Two players have the same Peak. Who is first?">
              <p>The one who set it first. When Peaks tie, the earlier kill ranks higher.</p>
            </Faq>
            <Faq q="Why does the Peak table show a kill time and date?">
              <p>
                They are the kill behind the score, so you can see when and how the record was set. Across a raid, the time is the sum of your best
                kills.
              </p>
            </Faq>
          </Section>

          <Section
            id="mastery"
            title="Ranked Mastery"
            accent={MASTERY.accent}
            icon={<MASTERY.icon className="size-5" style={{ color: MASTERY.accent }} />}
          >
            <Faq q="What is Ranked Mastery?" open>
              <p>
                The rating for <strong>consistency</strong>. It asks what you deliver on a normal night, using three views of your parses on each
                boss:
              </p>
              <ul>
                <li>
                  <strong>Peak</strong>: your best parse.
                </li>
                <li>
                  <strong>Form</strong>: your typical recent parse, with newer kills counting more.
                </li>
                <li>
                  <strong>Floor</strong>: the lower end of your play, your weaker but not worst nights.
                </li>
              </ul>
              <p>
                They combine as <Formula>30% Peak + 50% Form + 20% Floor</Formula>. Form carries the most weight because it is the best guide to your
                next kill.
              </p>
            </Faq>
            <Faq q="What is Evidence?">
              <p>
                How much of your record is proven. One kill shows something happened, not that it repeats, so until you have{" "}
                <strong>five kills on a boss</strong> your Ranked Mastery is held back a little. The leaderboards show Evidence as a percentage, and a{" "}
                <EvidenceBadge kills={5} /> mark once all five are in. Across a raid, Evidence counts every boss, so one thin boss lowers it without
                zeroing it.
              </p>
              <EvidenceChart />
            </Faq>
            <Faq q="Show me an example">
              <MasteryExample />
            </Faq>
            <MasteryCalculator />
            <Faq q="My Ranked Mastery went down. Why?">
              <p>
                Most likely your Form moved: Form favors recent kills, so a few weaker nights pull it down, and a few strong ones bring it back. Your
                Peak can also slip when the #1 sets a new record. Outside the 180-day view, older kills also leave the window.
              </p>
            </Faq>
            <Faq q="Does taking a break hurt me?">
              <p>
                No single kill is ever erased, and your All time ratings keep everything. The 180-day view only shows recent play, so it reflects
                whether you are raiding now, not how good you were.
              </p>
            </Faq>
          </Section>

          <Section id="renown" title="Renown" accent={RENOWN.accent} icon={<RENOWN.icon className="size-5" style={{ color: RENOWN.accent }} />}>
            <Faq q="What is Renown?" open>
              <p>
                Your <strong>career total</strong>: how many bosses you have killed, how often you come back to them, and how many full clears you
                have done. It is history, not skill. It never looks at your parses, and a high Renown does not mean a better player.
              </p>
            </Faq>
            <Faq q="How is it calculated?">
              <ul>
                <li>Each boss is worth up to 100. The first kill earns 50, and returning keeps adding, with each kill adding less.</li>
                <li>Each full clear of a raid adds 250.</li>
                <li>Renown earns a title as it grows: Known, Respected, Celebrated, Exalted, and Legendary.</li>
              </ul>
            </Faq>
            <RenownCalculator />
          </Section>

          <Section id="guilds" title="Guild ratings">
            <Faq q="Do guilds have ratings too?" open>
              <p>
                Yes. Switch the leaderboards to <strong>Guilds</strong> and the same three ratings rank guilds. A guild's parse is its{" "}
                <strong>kill time</strong> on a boss: the fastest kill of that boss on the server scores 100, and slower kills score less in
                proportion.
              </p>
              <ul>
                <li>On a boss, the guild's best kill time is its Peak.</li>
                <li>A single raid's guild Peak averages every boss, a missed boss counting as zero, just like characters.</li>
                <li>Guild Ranked Mastery and Renown follow exactly the same rules as characters.</li>
              </ul>
              <p>
                Ratings are built on <strong>kill times</strong>. Full clear times belong to the <strong>Speedruns</strong> tab, which ranks
                whole-raid runs on their own.
              </p>
            </Faq>
            <GuildPeakCalculator />
            <Faq q="Which kills count for a guild?">
              <p>
                Kills from the raids the speedrun boards credit to that guild. Class and spec filters do not apply to guilds, so they turn off in
                Guilds mode.
              </p>
            </Faq>
          </Section>

          <Section id="fairness" title="Fairness and limits">
            <Faq q="Is a low rating a sign of a bad player?" open>
              <p>
                No. Ratings only see what was logged: they say nothing about assignments, utility, raid leading, or the fights you carried in ways a
                meter cannot show. A low Evidence percentage means Chronicle has not seen enough kills yet, nothing more.
              </p>
            </Faq>
            <Faq q="Why is my spec ranked against my spec only?">
              <p>
                Specs do different jobs with different ceilings. Comparing a tank with a mage tells you about the specs, not the players, so every
                parse and rating stays inside its spec, and subspec where one exists.
              </p>
            </Faq>
            <Faq q="Will the formulas change?">
              <p>
                They may be tuned as more data comes in. When they change, every rating is recalculated with the new rules, so the leaderboards always
                compare like with like.
              </p>
            </Faq>
          </Section>
        </div>
      </div>
    </div>
  )
}

function MetricIntro({ metric, question, body }: { metric: "peak" | "mastery" | "renown"; question: string; body: string }) {
  const t = METRIC_THEMES[metric]
  return (
    <a
      href={`#${metric}`}
      className="group rounded-xl border bg-card p-5 transition-colors hover:border-white/20"
      style={{ boxShadow: `inset 0 2px 0 ${t.accent}` }}
    >
      <div className="flex items-center gap-2">
        <t.icon className="size-5" style={{ color: t.accent }} />
        <span className="font-wow text-xl" style={{ color: t.accent }}>
          {t.label}
        </span>
      </div>
      <p className="mt-3 text-sm font-medium">{question}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </a>
  )
}

function Section({ id, title, accent, icon, children }: { id: string; title: string; accent?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-3">
      <h2 id={`${id}-title`} className="flex items-center gap-2 border-b pb-2 font-wow text-2xl" style={accent ? { color: accent } : undefined}>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

/** One question, collapsible. The first of each section starts open. */
function Faq({ q, open, children }: { q: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-xl border bg-card/60 open:bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 font-medium [&::-webkit-details-marker]:hidden">
        {q}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 px-5 pb-5 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a:hover]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground [&_ul]:space-y-1">
        {children}
      </div>
    </details>
  )
}

function Formula({ children }: { children: ReactNode }) {
  return <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[13px] text-foreground">{children}</span>
}

function Example({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-lg border bg-black/20">
      <p className="border-b px-4 py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
      <dl className="divide-y divide-white/5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2">
            <dt>{k}</dt>
            <dd className="font-mono text-foreground tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Two players, both with a 100 Peak: one lucky kill against a record of strong nights. */
function MasteryExample() {
  const players = [
    { name: "Player A", note: "one kill: 100", inputs: { peak: 100, form: 100, floor: 100, kills: 1 } },
    { name: "Player B", note: "six kills: 86 to 100", inputs: { peak: 100, form: 92, floor: 87, kills: 6 } },
  ]
  const [a, b] = players.map((p) => calculateMastery(p.inputs))
  return (
    <>
      <p>
        Both players have a perfect Peak. Player A has one kill; Player B has six, from 86 up to 100. Ranked Mastery tells them apart without taking
        anything from Player A's 100.
      </p>
      <div className="overflow-x-auto rounded-lg border bg-black/20">
        <table className="w-full text-sm">
          <thead className="border-b text-xs tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Player</th>
              <th className="px-3 py-2 text-right font-medium">Peak</th>
              <th className="px-3 py-2 text-right font-medium">Form</th>
              <th className="px-3 py-2 text-right font-medium">Floor</th>
              <th className="px-3 py-2 text-right font-medium">Evidence</th>
              <th className="px-4 py-2 text-right font-medium">Ranked Mastery</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const m = calculateMastery(p.inputs)
              return (
                <tr key={p.name} className="border-b border-white/5 last:border-b-0">
                  <td className="px-4 py-2">
                    <span className="text-foreground">{p.name}</span>
                    <span className="block text-xs">{p.note}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{m.peak}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{m.form}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{m.floor}</td>
                  <td className="px-3 py-2 text-right">
                    <EvidenceBadge kills={m.kills} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-base tabular-nums" style={{ color: MASTERY.accent }}>
                    {m.rankedMastery.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p>
        Player A's estimate is 100, but with one kill only 65% of it counts: {a.rankedMastery.toFixed(1)}. Four more kills at that level would make it
        100. Player B's {b.rankedMastery.toFixed(1)} is fully proven.
      </p>
    </>
  )
}
