import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Calculator } from "lucide-react";
import { iconUrl } from "@/config/iconUrl";
import { parseHexColor } from "@/pages/Instance/parseColors";
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes";
import type { BlogPostDefinition } from "../blogRegistry";
import { ShortPost } from "./ShortPost";

type PostProps = { post: BlogPostDefinition };

const GOLD = "#f0c060";
const PEAK = METRIC_THEMES.peak.accent;
const MASTERY = METRIC_THEMES.mastery.accent;
const PARCHMENT = "radial-gradient(ellipse at 30% 15%, #ead9ae 0%, #d3ba8c 55%, #bda276 100%)";
const GOBLIN = "/c/images/blog/goblin.webp";

/** Chapters in reading order; the goblin comments as each one comes into view. */
const CHAPTERS = [
  { numeral: "Prologue", title: "A letter", icon: "inv_letter_15", quip: "A letter from the boss. Read the whole thing, I'm counting." },
  { numeral: "Chapter I", title: "Why add ratings alongside parses?", icon: "ability_hunter_snipershot", quip: "Same DPS, different parse? Depends who showed up that week." },
  { numeral: "Chapter II", title: "Distance from the best, rather than position in the population", icon: "inv_misc_spyglass_02", quip: "Distance from the best. Now that's something I can measure." },
  { numeral: "Chapter III", title: "Recognizing more than one exceptional performance", icon: "inv_misc_pocketwatch_01", quip: "One lucky night, or every night? Those cost different amounts." },
  { numeral: "Chapter IV", title: "Comparing achievements across raids and specializations", icon: "inv_misc_coin_01", quip: "835 points... out of what? Exactly." },
  { numeral: "Chapter V", title: "Renown: Recognizing participation", icon: "inv_crown_01", quip: "Points for showing up? Now you're speaking my language." },
  { numeral: "Chapter VI", title: "What I got wrong with the Armory", icon: "inv_misc_wrench_01", quip: "He broke it, he fixed it. I've seen worse repair bills." },
  { numeral: "Chapter VII", title: "Moving forward", icon: "inv_misc_book_09", quip: "Nearly there, friend. The ledger almost balances." },
] as const;

const DONE_QUIP = "Quest complete! No refunds.";
/** Reading progress that counts as finished. */
const DONE_AT = 0.995;

/** A letter to the community: the Armory mistake, and why ratings exist. */
export function BeyondTheBestParsePost({ post }: PostProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <ShortPost post={post}>
      <div ref={bodyRef} className="pb-16">
        <Chapter index={0} hideTitle />
        <p>
          I&apos;ve seen a lot of feedback about ratings and the Armory changes. I want to respond to it, explain why
          ratings exist, and share where I&apos;d like to take Chronicle.
        </p>
        <p>
          First, <strong>removing the old Armory view was a mistake, and I&apos;m sorry.</strong>
        </p>
        <p>
          I saw the old Armory as a summary of your parses, and I believed ratings could summarize better. What I
          overlooked is that it was also{" "}
          <strong>your window into individual parses and performance history.</strong>
        </p>
        <p>
          <strong>Ratings are not parses, and they don&apos;t replace them.</strong> They answer a different question.
          Your parses are important, and they deserve their own place on your profile.
        </p>
        <p>
          <strong>I&apos;ve since restored the old view and added parse history to the toggled view.</strong> That
          change came directly from your feedback. I also could have done a better job explaining what the new numbers
          mean, so let&apos;s do that.
        </p>

        <Chapter index={1} />
        <p>
          Parses are useful. They&apos;re familiar, competitive, and a great way to see how one performance compares to
          others.
        </p>
        <PullQuote>
          What I&apos;ve struggled with is using parse scores to compare players across different specializations,
          raids, and points in time.
        </PullQuote>
        <p>
          A parse depends on who else is in the comparison. Split a smaller server by spec and boss, and some groups
          get tiny: a 95 in a crowded spec and a 95 in a nearly empty one don&apos;t describe the same thing.
        </p>
        <p>
          The comparison also moves. <strong>Parses are relative to a rolling 60-day window</strong>, so the same DPS
          can parse differently depending on who raided that week:
        </p>
        <WeekendStrip />
        <p>
          That isn&apos;t wrong.{" "}
          <strong>A parse tells you where a performance stood within a particular population at a particular time.</strong>{" "}
          I just wanted Chronicle to answer a different question too.
        </p>

        <Chapter index={2} />
        <p>
          Peak measures <strong>how close a performance came to the best recorded result</strong> for the same spec and
          boss. If the record is 2,000 DPS and you do 1,600, your Peak is 80: you reached 80% of the benchmark.
        </p>
        <p>
          <strong>Peak is independent of the population size. Only the benchmark matters.</strong> That&apos;s
          deliberate: the goal is to remove population-size bias from ratings, so a spec with a handful of recorded
          kills is measured the same way as a spec with thousands.
        </p>
        <PullQuote>
          Parses measure your position within a population. Peak measures your distance from a benchmark.
        </PullQuote>
        <PositionVsDistance />
        <p>
          <strong>It isn&apos;t perfect.</strong> The benchmark depends on the best-performing player of a spec, so a
          new record lowers everyone else&apos;s Peak, and determining the benchmark might need more work.
        </p>

        <h3>A common scale for different performances</h3>
        <p>
          If you play a Hunter, you know what good Hunter DPS looks like. Open a Balance Druid&apos;s profile, and half
          your DPS might be excellent for them, or not. Raw numbers don&apos;t tell you.{" "}
          <strong>Normalizing against each spec&apos;s own benchmark puts everyone on the same scale:</strong>
        </p>
        <CommonScale />
        <p>
          That doesn&apos;t mean two players are equally skilled, but the numbers now answer the same question. Guilds
          work the same way, using encounter and clear times instead of DPS.
        </p>

        <Chapter index={3} />
        <p>
          Having one incredible night and performing well every week are different accomplishments, and I wanted
          Chronicle to recognize both.
        </p>
        <TwoPlayers />
        <PullQuote>
          Peak recognizes your best performance. Mastery recognizes your consistency.
        </PullQuote>
        <p>
          Mastery blends your Peak with the rest of your kills, so repeatable results count for more than a single great
          one.
        </p>

        <Chapter index={4} />
        <p>
          Combining your best performances across bosses isn&apos;t new. Warcraft Logs has <strong>All Star Points</strong>
          , which award up to 120 points per boss and add up across a raid. But is 835 points good? That depends on how
          many bosses there were.
        </p>
        <p>
          <strong>Chronicle keeps Peak and Mastery on a 0–100 scale</strong>, whether you&apos;re looking at one boss, a
          raid, or a whole Career. A 90 always means 90% of the benchmark.
        </p>
        <PointsVsScale />
        <PullQuote>
          Once you understand what a rating means on your own profile, you can understand it anywhere on Chronicle.
        </PullQuote>

        <Chapter index={5} />
        <p>
          Not every achievement is about damage or healing. Some players raid every week for months or years.{" "}
          <strong>Renown measures how much content you&apos;ve completed, not how well you performed.</strong> Every boss
          kill earns that boss&apos;s award. It&apos;s a little like DKP, except you never spend it:
        </p>
        <RenownLedger />
        <p>Renown isn&apos;t a 0–100 rating. It only adds up, and that&apos;s intentional.</p>
        <PullQuote>I don&apos;t believe there&apos;s only one way to be a valuable raider.</PullQuote>

        <Chapter index={6} />
        <p>
          The old Armory wasn&apos;t only a summary of your performance. It also showed your individual parses, and I
          underestimated how much that mattered.
        </p>
        <PullQuote>In trying to improve the summary, I removed access to parses.</PullQuote>
        <p>
          That was the wrong decision. <strong>The old Armory view is back, with some new enhancements:</strong>
        </p>
        <ArmoryRewards />
        <p>
          Ratings and parse history should complement each other, not compete for space. Now that ratings handle the
          big-picture questions, I&apos;d like parse history to focus on individual performances, progress, and what
          happened in each fight. <strong>More ways to explore your data can and will be added.</strong> I just
          don&apos;t want to rush another redesign, so it will come in steps rather than all at once.
        </p>

        <Chapter index={7} />
        <p>
          I still believe in ratings, but they aren&apos;t perfect. How benchmarks are set, how kills are combined, and
          how specs compare are all worth improving. And a rating is only useful if people understand it.
        </p>
        <p>
          Thank you to everyone who took the time to tell me when a change made the site less useful for them.
        </p>
        <PullQuote>
          My goal with ratings was never to take something away. It was to give players more ways to understand and
          celebrate what they&apos;ve accomplished.
        </PullQuote>
        <p>Thanks for being part of the project.</p>
        <p className="font-wow text-2xl" style={{ color: GOLD }}>
          — Chronicle
        </p>
      </div>
      <ReadingBar bodyRef={bodyRef} />
    </ShortPost>
  );
}

/** A chapter heading the reading bar tracks; the prologue only marks its start. */
function Chapter({ index, hideTitle }: { index: number; hideTitle?: boolean }) {
  const chapter = CHAPTERS[index];
  return (
    <div data-chapter={index} className="not-prose mt-14 mb-5 flex items-center gap-4 first:mt-0">
      <img
        src={iconUrl(chapter.icon)}
        alt=""
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-md border-2 shadow-lg shadow-black/40"
        style={{ borderColor: `${GOLD}99` }}
      />
      <div className="min-w-0">
        <div className="font-mono text-[11px] tracking-[0.25em] uppercase" style={{ color: GOLD }}>
          {chapter.numeral}
        </div>
        {hideTitle ? (
          <div className="font-wow text-xl text-foreground">{chapter.title}</div>
        ) : (
          <h2 className="font-wow text-2xl leading-tight text-foreground sm:text-3xl">{chapter.title}</h2>
        )}
      </div>
    </div>
  );
}

function PullQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote
      className="not-prose my-8 border-l-4 py-1 pl-5 font-wow text-xl leading-snug text-foreground sm:text-2xl"
      style={{ borderColor: GOLD }}
    >
      <span aria-hidden="true" className="mr-1" style={{ color: GOLD }}>
        &ldquo;
      </span>
      {children}
      <span aria-hidden="true" className="ml-1" style={{ color: GOLD }}>
        &rdquo;
      </span>
    </blockquote>
  );
}

/** A diagram frame: a caption bar over the figure. */
function Figure({ label, caption, children }: { label: string; caption?: string; children: ReactNode }) {
  return (
    <figure className="not-prose my-8 overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/30">
      <div className="border-b border-border bg-muted/40 px-4 py-2 font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
      {caption && (
        <figcaption className="border-t border-border px-4 py-2 text-xs text-muted-foreground italic">{caption}</figcaption>
      )}
    </figure>
  );
}

// The weekend: Friday's 28 of 31 kills below 1,600 parse 90; Saturday's 4 top
// kills make Sunday's identical kill 28 of 35, a parse of 80.
const WEEKEND_FRIDAY = [...Array.from({ length: 28 }, (_, i) => 900 + i * 25), 1620, 1660, 1700];
const SATURDAY_TOP_GUILD = [1760, 1830, 1890, 1950];
const YOU = 1600;

function parseAgainst(population: readonly number[], value: number): number {
  return Math.round((100 * population.filter((v) => v < value).length) / population.length);
}

/** Dots on a DPS axis, with "you" marked. */
function DotStrip({ population, you, highlight }: { population: readonly number[]; you?: number; highlight?: readonly number[] }) {
  const min = 800;
  const max = 2000;
  const x = (v: number) => `${(100 * (v - min)) / (max - min)}%`;
  return (
    <div className="relative h-10">
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      {population.map((v, i) => (
        <span
          key={i}
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${population.length > 20 ? "size-1.5 sm:size-2" : "size-2.5"}`}
          style={{ left: x(v), background: highlight?.includes(v) ? "#f87171" : "#71717a" }}
        />
      ))}
      {you !== undefined && (
        <span
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{ left: x(you), background: GOLD }}
          title={`You: ${you.toLocaleString()} DPS`}
        />
      )}
    </div>
  );
}

function WeekendStrip() {
  const saturday = [...WEEKEND_FRIDAY, ...SATURDAY_TOP_GUILD];
  const days = [
    { day: "Friday", note: "Your guild raids", population: WEEKEND_FRIDAY, you: YOU, highlight: undefined },
    { day: "Saturday", note: "The strongest guild raids", population: saturday, you: undefined, highlight: SATURDAY_TOP_GUILD },
    { day: "Sunday", note: "Another guild raids", population: saturday, you: YOU, highlight: undefined },
  ];
  return (
    <Figure
      label="Illustration · the same 1,600 DPS, two days apart"
      caption="Grey dots are other kills in the comparison, red dots are Saturday's new top kills, and gold is a 1,600 DPS kill. Example numbers."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {days.map((d) => {
          const parse = d.you === undefined ? undefined : parseAgainst(d.population, d.you);
          return (
            <div key={d.day} className="rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-baseline justify-between">
                <span className="font-wow text-lg text-foreground">{d.day}</span>
                {parse !== undefined && (
                  <span className="font-mono text-2xl font-bold" style={{ color: parseHexColor(parse) }}>
                    {parse}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{d.note}</div>
              <div className="mt-2">
                <DotStrip population={d.population} you={d.you} highlight={d.highlight} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {parse !== undefined ? `1,600 DPS · parse ${parse}` : `+${SATURDAY_TOP_GUILD.length} kills above 1,600 DPS`}
              </div>
            </div>
          );
        })}
      </div>
    </Figure>
  );
}

// Real Baron Geddon kills from one Chronicle server's 60-day parse cohorts, as of
// 2026-11-14. Players are left anonymous; each cohort's best kill is its benchmark.
const REAL_COHORTS = [
  {
    spec: "Beast Mastery Hunter",
    icon: "/c/icons/spec_hunter_beastmastery.png",
    kills: 641,
    top: [
      { dps: 2013, parse: 100 },
      { dps: 1624, parse: 100 },
      { dps: 1598, parse: 100 },
      { dps: 1587, parse: 100 },
      { dps: 1563, parse: 99 },
    ],
  },
  {
    spec: "Enhancement Shaman",
    icon: "/c/icons/spec_shaman_enhancement.png",
    kills: 795,
    top: [
      { dps: 1382, parse: 100 },
      { dps: 1252, parse: 100 },
      { dps: 1128, parse: 100 },
      { dps: 1116, parse: 100 },
      { dps: 1106, parse: 100 },
    ],
  },
] as const;

/** The top of two real cohorts: parses bunch up at 100, Peak keeps the distance to the best. */
function PositionVsDistance() {
  return (
    <Figure
      label="Real kills · Baron Geddon · last 60 days"
      caption="Top five kills in two real cohorts on one Chronicle server, players left anonymous. Peak here is each kill against the cohort's best."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {REAL_COHORTS.map((cohort) => {
          const best = cohort.top[0].dps;
          return (
            <div key={cohort.spec}>
              <div className="flex items-center gap-2">
                <img src={cohort.icon} alt="" width={28} height={28} className="size-7 rounded" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{cohort.spec}</div>
                  <div className="text-[11px] text-muted-foreground">{cohort.kills} kills in the comparison</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[1.5rem_minmax(0,1fr)_2.5rem_2.75rem] items-center gap-x-2 gap-y-1.5 text-sm">
                <span />
                <span className="text-[11px] tracking-wider text-muted-foreground uppercase">DPS</span>
                <span className="text-right text-[11px] tracking-wider text-muted-foreground uppercase">Parse</span>
                <span className="text-right text-[11px] tracking-wider text-muted-foreground uppercase">Peak</span>
                {cohort.top.map((kill, i) => {
                  const peak = (100 * kill.dps) / best;
                  return (
                    <Fragment key={i}>
                      <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                      <span className="relative h-5 overflow-hidden rounded bg-border/60">
                        <span
                          className="absolute inset-y-0 left-0 rounded"
                          style={{ width: `${peak}%`, background: `${PEAK}55` }}
                        />
                        <span className="relative px-1.5 font-mono text-xs leading-5 text-foreground">
                          {kill.dps.toLocaleString()}
                        </span>
                      </span>
                      <span className="text-right font-mono font-bold" style={{ color: parseHexColor(kill.parse) }}>
                        {kill.parse}
                      </span>
                      <span className="text-right font-mono font-bold" style={{ color: PEAK }}>
                        {Math.round(peak)}
                      </span>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
        A 2,013 and a 1,624 DPS kill both parse <strong style={{ color: parseHexColor(100) }}>100</strong>: each beat
        nearly everyone else. Peak keeps the gap: <strong style={{ color: PEAK }}>100</strong> and{" "}
        <strong style={{ color: PEAK }}>81</strong>.
      </p>
    </Figure>
  );
}

function CommonScale() {
  const rows = [
    { spec: "Hunter", icon: "ability_hunter_snipershot", dps: 1600, benchmark: 2000 },
    { spec: "Balance Druid", icon: "spell_nature_starfall", dps: 800, benchmark: 1000 },
  ];
  return (
    <Figure label="Two specs, one scale" caption="Example numbers. Different DPS, same Peak: each reached 80% of its own benchmark.">
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.spec} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <img src={iconUrl(r.icon)} alt="" width={32} height={32} className="size-8 rounded" />
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground">{r.spec}</span>
                <span className="font-mono text-muted-foreground">
                  {r.dps.toLocaleString()} of {r.benchmark.toLocaleString()} DPS
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full" style={{ width: `${(100 * r.dps) / r.benchmark}%`, background: PEAK }} />
              </div>
            </div>
            <div className="w-16 text-right font-mono text-2xl font-bold" style={{ color: PEAK }}>
              {Math.round((100 * r.dps) / r.benchmark)}
            </div>
          </div>
        ))}
      </div>
    </Figure>
  );
}

function TwoPlayers() {
  // Each kill against the benchmark, 0–100.
  const players = [
    { name: "One incredible night", kills: [52, 48, 98, 55, 50, 46, 58, 51] },
    { name: "Strong, every week", kills: [86, 84, 88, 85, 87, 83, 89, 86] },
  ];
  return (
    <Figure label="Two raiders, eight kills each" caption="Example numbers. Bar height is each kill against the benchmark.">
      <div className="grid gap-5 sm:grid-cols-2">
        {players.map((p) => {
          const best = Math.max(...p.kills);
          const typical = [...p.kills].sort((a, b) => a - b)[Math.floor(p.kills.length / 2)];
          return (
            <div key={p.name}>
              <div className="text-sm font-semibold text-foreground">{p.name}</div>
              <div className="mt-2 flex h-24 items-end gap-1.5 border-b border-border">
                {p.kills.map((k, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t"
                    style={{ height: `${k}%`, background: k === best ? PEAK : MASTERY, opacity: k === best ? 1 : 0.75 }}
                  />
                ))}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Best kill <span style={{ color: PEAK }}>{best}</span> · typical kill around{" "}
                <span style={{ color: MASTERY }}>{typical}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Figure>
  );
}

function PointsVsScale() {
  return (
    <Figure label="Which number tells you more?">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <div className="text-xs tracking-wider text-muted-foreground uppercase">Accumulated points</div>
          <div className="mt-1 font-mono text-4xl font-bold text-foreground">835</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[repeating-linear-gradient(90deg,var(--color-border)_0_6px,transparent_6px_10px)]">
            <div className="h-full w-[60%] rounded-full bg-muted-foreground/60" />
          </div>
          <div className="mt-2 text-sm text-muted-foreground">out of… depends how many bosses there were.</div>
        </div>
        <div className="rounded-lg border bg-background/50 p-4" style={{ borderColor: `${PEAK}80` }}>
          <div className="text-xs tracking-wider text-muted-foreground uppercase">Peak, normalized</div>
          <div className="mt-1 font-mono text-4xl font-bold" style={{ color: PEAK }}>
            90
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full w-[90%] rounded-full" style={{ background: PEAK }} />
          </div>
          <div className="mt-2 text-sm text-muted-foreground">out of 100. On a boss, a raid, or a whole Career.</div>
        </div>
      </div>
    </Figure>
  );
}

/** Renown as a goblin's ledger: every kill earns its boss's award. */
function RenownLedger() {
  const entries = [
    ["Razorgore the Untamed", 2],
    ["Vaelastrasz the Corrupt", 2],
    ["Broodlord Lashlayer", 2],
    ["Chromaggus", 2],
    ["Nefarian", 9],
  ] as const;
  const total = entries.reduce((s, [, award]) => s + award, 0);
  return (
    <figure className="not-prose relative mx-auto mt-24 mb-12 max-w-md">
      <img
        src={GOBLIN}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute right-2 bottom-full -mb-6 h-28 w-auto drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)]"
      />
      <div className="rounded-xl border-2 border-[#6b5320] shadow-2xl shadow-black/40" style={{ background: PARCHMENT }}>
        <div className="border-b border-[#8a704a]/50 px-5 pt-4 pb-2 font-wow">
          <div className="text-lg font-bold text-[#5a3c10]">The Renown Ledger</div>
          <div className="text-xs text-[#7a5c36]">One Blackwing Lair night, as an example</div>
        </div>
        <ul className="px-5 py-3 font-wow text-[15px] text-[#4a3520]">
          {entries.map(([boss, award]) => (
            <li key={boss} className="flex justify-between border-b border-dotted border-[#8a704a]/40 py-1 last:border-0">
              <span>{boss}</span>
              <span className="font-bold text-[#5a2d80]">+{award}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-[#8a704a]/50 px-5 py-2.5 font-wow text-[#5a3c10]">
          <span className="font-bold">Kept forever</span>
          <span className="font-bold text-[#5a2d80]">+{total} Renown</span>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs text-muted-foreground italic">
        Example awards. Never spent, never lost.
      </figcaption>
    </figure>
  );
}

function ArmoryRewards() {
  return (
    <div className="not-prose my-8 overflow-hidden rounded-xl border-2 border-[#6b5320] shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between bg-[#1e1710] px-4 py-2.5 font-wow">
        <span className="text-base font-bold tracking-[0.08em]" style={{ color: GOLD }}>
          Quest Complete: Restore the Armory
        </span>
        <span className="text-xs text-[#cfb88a]">Already live</span>
      </div>
      <div className="px-5 py-4 font-wow text-[#4a3520]" style={{ background: PARCHMENT }}>
        <p className="text-[15px] leading-snug">
          Open any character&apos;s Armory, pick <strong>Performance</strong>, and switch between Ratings and Parses.
        </p>
        <div className="mt-3 text-[13px] font-bold text-[#6b5330]">You receive:</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Reward
            icon={<BarChart3 className="size-5 text-[#f0c060]" />}
            title="The Parses view"
            body="Your Player Score and best-3 parse average per boss over the last 60 days, back where it was."
          />
          <Reward
            icon={<Calculator className="size-5 text-sky-300" />}
            title="The boss explorer"
            body="Every logged kill of a boss, as Parse, Peak, Mastery, and Renown. Or every boss of a raid at once."
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex rounded-full border border-[#6b5320]/60 bg-[#1e1710] p-0.5 font-sans text-xs">
            <span className="rounded-full px-3 py-1 text-[#cfb88a]">Ratings</span>
            <span className="rounded-full bg-sky-500/25 px-3 py-1 text-white ring-1 ring-sky-400/60">Parses</span>
          </span>
          <a href="/armory" className="text-sm font-bold text-[#215c10] underline-offset-2 hover:underline">
            Open the Armory →
          </a>
        </div>
      </div>
    </div>
  );
}

function Reward({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-2.5 rounded-md border border-[#8a704a]/50 bg-black/5 p-2">
      <span className="flex size-10 shrink-0 items-center justify-center rounded border-2 border-[#8a6a2a] bg-[#14141f]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] leading-tight font-bold text-[#215c10]">{title}</span>
        <span className="block text-[13px] leading-snug">{body}</span>
      </span>
    </div>
  );
}

/**
 * An experience bar pinned to the bottom of the screen: how far through the
 * letter you are, which chapter you're in, and a goblin riding along.
 */
function ReadingBar({ bodyRef }: { bodyRef: React.RefObject<HTMLDivElement | null> }) {
  const [progress, setProgress] = useState(0);
  const [chapter, setChapter] = useState(0);
  const [quipVisible, setQuipVisible] = useState(false);

  useEffect(() => {
    let spoken: string | undefined;
    let hideTimer: number | undefined;
    const update = () => {
      const body = bodyRef.current;
      if (!body) return;
      const rect = body.getBoundingClientRect();
      // Read up to the line 85% of the way down the screen; the sign-off reaching it is 100%.
      const next = Math.max(0, Math.min(1, (window.innerHeight * 0.85 - rect.top) / Math.max(1, rect.height)));
      setProgress(next);
      let current = 0;
      body.querySelectorAll<HTMLElement>("[data-chapter]").forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.4) current = Number(el.dataset.chapter);
      });
      setChapter(current);
      // The goblin speaks up for a few seconds whenever a new chapter starts.
      const key = next >= DONE_AT ? "done" : String(current);
      if (next > 0.01 && key !== spoken) {
        spoken = key;
        setQuipVisible(true);
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => setQuipVisible(false), 4500);
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.clearTimeout(hideTimer);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [bodyRef]);

  const done = progress >= DONE_AT;
  const pct = Math.round(progress * 100);
  const quip = done ? DONE_QUIP : CHAPTERS[chapter].quip;
  const onRight = progress > 0.55;
  return (
    <div
      className="not-prose pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-2 transition-opacity duration-300 sm:px-6"
      style={{ opacity: progress > 0.01 ? 1 : 0 }}
      aria-hidden="true"
    >
      <div className="relative mx-auto max-w-3xl">
        {/* The goblin rides the fill's leading edge, kept inside the bar. */}
        <div
          className="absolute bottom-full -mb-3 -translate-x-1/2 transition-[left] duration-200 ease-out"
          style={{ left: `clamp(2rem, ${pct}%, calc(100% - 2rem))` }}
        >
          <div className="relative">
            <img src={GOBLIN} alt="" className="h-14 w-auto max-w-none drop-shadow-[0_4px_6px_rgba(0,0,0,0.6)] sm:h-16" />
            <div
              className={`absolute bottom-full mb-1 w-56 rounded-lg border-2 border-[#4a4a6a] bg-[#1a1a2e] px-3 py-2 text-xs leading-snug text-[#ffd200] shadow-xl shadow-black/60 transition-opacity duration-300 ${onRight ? "right-0" : "left-0"}`}
              style={{ opacity: quipVisible ? 1 : 0 }}
            >
              {quip}
            </div>
          </div>
        </div>
        <div className="relative h-5 overflow-hidden rounded-md border-2 border-[#4a4a6a] bg-[#14141f] shadow-xl shadow-black/60">
          <div
            className="h-full transition-[width] duration-200 ease-out"
            style={{
              width: `${pct}%`,
              background: done
                ? "linear-gradient(180deg, #ffd27a, #c8902a)"
                : "linear-gradient(180deg, #b07ae8, #6a2fb8 60%, #4a1d88)",
            }}
          />
          {/* Twenty segments, like the experience bar. */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: 20 }, (_, i) => (
              <span key={i} className="flex-1 border-r border-black/50 last:border-0" />
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center gap-2 px-2 text-[10px] font-semibold text-white [text-shadow:1px_1px_1px_#000] sm:text-[11px]">
            <span className="truncate">
              {done ? "Quest complete" : `${CHAPTERS[chapter].numeral}: ${CHAPTERS[chapter].title}`}
            </span>
            <span className="shrink-0 tabular-nums">{pct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
