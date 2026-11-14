import { useEffect, useRef, useState, type ReactNode } from "react";
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
const RENOWN = METRIC_THEMES.renown.accent;
const PARCHMENT = "radial-gradient(ellipse at 30% 15%, #ead9ae 0%, #d3ba8c 55%, #bda276 100%)";
const GOBLIN = "/c/images/blog/goblin.webp";

/** Chapters in reading order; the goblin comments as each one comes into view. */
const CHAPTERS = [
  { numeral: "Prologue", title: "A letter", icon: "inv_letter_15", quip: "A letter from the boss. Read the whole thing, I'm counting." },
  { numeral: "Chapter I", title: "Why move beyond parses?", icon: "ability_hunter_snipershot", quip: "Same DPS, different parse? Depends who showed up that week." },
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
          I&apos;ve seen quite a bit of feedback about Chronicle&apos;s new ratings system and the changes to the Armory.
          I want to take some time to address that feedback, explain the motivation behind these changes, and share
          where I&apos;d like to take Chronicle.
        </p>
        <p>
          First, <strong>removing the old Armory view was a mistake, and I&apos;m sorry.</strong>
        </p>
        <p>
          When I introduced ratings, I was focused on improving how Chronicle measures and summarizes performance. I saw
          the old Armory primarily as a way to aggregate parses, and I believed ratings could do that job better.
        </p>
        <p>
          What I overlooked was that the old view served another important purpose:{" "}
          <strong>it gave players visibility into their individual parses and performance history.</strong>
        </p>
        <p>
          That information is valuable on its own. Ratings don&apos;t replace it, and removing the view took away
          something people genuinely enjoyed using.
        </p>
        <p>
          <strong>I&apos;ve since restored the old view and added parse history to the toggled view</strong>, making
          that information accessible again while improving on what was there before. That change came directly from
          your feedback.
        </p>
        <p>
          I also recognize that the new ratings aren&apos;t as immediately familiar or easy to understand as parses. I
          could have done a better job introducing the system and explaining what these numbers represent.
        </p>
        <p>With that addressed, I want to explain why I introduced ratings in the first place.</p>

        <Chapter index={1} />
        <p>
          Parses are useful. They&apos;re familiar, competitive, and a great way to understand how a particular
          performance compares to others.
        </p>
        <PullQuote>
          What I&apos;ve struggled with is using parse scores to compare players across different specializations,
          raids, and points in time.
        </PullQuote>
        <p>
          The problem isn&apos;t that parses are bad measurements. It&apos;s that their meaning depends on the players
          and performances included in the comparison.
        </p>
        <p>This becomes particularly noticeable on the smaller servers Chronicle supports.</p>
        <p>
          Once you divide a server&apos;s population by specialization and encounter, some comparison groups can become
          quite small. One specialization might have hundreds of recorded performances, while another has only a
          fraction of that.
        </p>
        <p>
          A 95 parse in one specialization might represent a very different competitive environment than a 95 in
          another. Both scores describe where those performances stand within their respective populations, but that
          doesn&apos;t necessarily make them directly comparable.
        </p>
        <p>
          Smaller populations can also make these comparisons more sensitive to individual results entering or leaving
          the dataset.
        </p>
        <p>
          And that brings me to another concern:{" "}
          <strong>parses are relative to a changing population over a rolling 60-day window.</strong>
        </p>
        <p>
          Imagine your guild raids on Friday. The strongest guild on the server raids Saturday, and another guild raids
          Sunday.
        </p>
        <p>
          On Friday, your performance is compared against the population available at that moment. Saturday&apos;s
          stronger performances haven&apos;t happened yet.
        </p>
        <p>By Sunday, those performances are part of the comparison population.</p>
        <p>
          Two players could deliver identical DPS but receive different parse scores simply because they raided on
          different days.
        </p>
        <WeekendStrip />
        <p>
          The same thing happens over longer periods. As performances enter and leave the 60-day window, the population
          changes, and so does the meaning of a particular percentile.
        </p>
        <p>
          This isn&apos;t inherently wrong.{" "}
          <strong>
            A parse tells you where a performance stands within a particular population at a particular time.
          </strong>
        </p>
        <p>That&apos;s useful information. But I wanted Chronicle to answer a different question.</p>

        <Chapter index={2} />
        <p>The fundamental idea behind Peak is relatively simple.</p>
        <p>
          Instead of asking where a performance ranks among everyone else, I wanted to measure{" "}
          <strong>how close that performance came to the best recorded result</strong> for the same specialization and
          encounter.
        </p>
        <p>For example, imagine the highest recorded DPS for an encounter is 2,000.</p>
        <p>If you achieve 1,600 DPS, your Peak rating is 80.</p>
        <p>You achieved 80% of the benchmark.</p>
        <p>
          It doesn&apos;t matter whether there are 50 other players below you or 5,000. As long as the benchmark remains
          unchanged, your distance from it remains the same.
        </p>
        <p>This is the distinction I wanted to establish:</p>
        <PullQuote>
          Parses measure your position within a population. Peak measures your distance from a benchmark.
        </PullQuote>
        <PositionVsDistance />
        <p>
          Peak still depends on other players&apos; performances. An exceptional new record can raise the benchmark and
          lower existing ratings. A small or less competitive population can also affect how representative its best
          recorded performance is.
        </p>
        <p>
          It isn&apos;t a perfect measurement, and it doesn&apos;t eliminate every challenge associated with comparing
          different specializations.
        </p>
        <p>
          But it removes the rolling-window limitation and offers a different basis for comparison using all eligible
          recorded history.
        </p>

        <h3>A common scale for different performances</h3>
        <p>Another motivation was making performance easier to understand outside your own specialization.</p>
        <p>
          Imagine you&apos;re a Hunter. You probably have a reasonable idea of what good Hunter DPS looks like for a
          particular boss.
        </p>
        <p>But what if you open a Balance Druid&apos;s profile?</p>
        <p>Their damage might be half of yours. Is that good? Bad? Exceptional for a Balance Druid?</p>
        <p>Unless you know that specialization well, the raw DPS alone doesn&apos;t tell you much.</p>
        <p>
          <strong>
            By normalizing performance against specialization-specific benchmarks, I wanted to give these numbers a
            shared interpretation.
          </strong>
        </p>
        <p>
          If you understand what an 80 Peak means for your own specialization, you can understand what an 80 Peak means
          for someone else&apos;s: both performances reached 80% of their respective benchmarks.
        </p>
        <CommonScale />
        <p>
          That doesn&apos;t mean both players demonstrated identical skill, or that their encounters were equally
          difficult. But the numbers now answer the same question.
        </p>
        <p>This extends beyond players, too.</p>
        <p>
          Chronicle also applies Peak and Mastery to guild performance, using encounter and clear times rather than
          DPS.
        </p>
        <p>
          The underlying calculations account for the different measurements, but the interpretation remains familiar:
          Peak describes proximity to the best recorded result, while Mastery considers performance across repeated
          attempts.
        </p>
        <p>
          <strong>
            The goal is that learning what a rating means on your own profile helps you understand what it means
            everywhere else on Chronicle.
          </strong>
        </p>
        <p>There was also a practical motivation behind this approach.</p>
        <p>
          Chronicle is a project I maintain myself, including the work of investigating and correcting problematic logs.
        </p>
        <p>
          With a benchmark-based approach, I can focus on the performances establishing the reference point for each
          comparison. That doesn&apos;t eliminate the need to moderate other data, but it makes maintaining the scoring
          reference more manageable.
        </p>
        <p>
          I wanted a system that was straightforward to interpret, practical to maintain, and useful as Chronicle
          continues to grow.
        </p>

        <Chapter index={3} />
        <p>Peak is only part of the system.</p>
        <p>
          One thing I&apos;ve always wanted Chronicle to recognize is the difference between having an incredible night
          and performing well consistently.
        </p>
        <p>
          Someone might have one exceptional encounter where everything goes perfectly. Another player might perform
          very well across dozens of encounters without ever achieving that same peak.
        </p>
        <TwoPlayers />
        <p>Both are accomplishments, but they&apos;re different accomplishments.</p>
        <p>That&apos;s why Mastery exists.</p>
        <PullQuote>
          Peak recognizes your best performance. Mastery considers your broader performance history.
        </PullQuote>
        <p>
          Mastery combines Peak with measurements of your other performances, placing more emphasis on repeatable
          results than a single exceptional kill.
        </p>
        <p>
          Neither number tells the entire story of a player. They&apos;re intended to provide different perspectives on
          performance.
        </p>

        <Chapter index={4} />
        <p>
          The idea of combining your best performances across multiple bosses isn&apos;t new. Other logging platforms,
          such as Warcraft Logs, have a similar system called <strong>All Star Points</strong>.
        </p>
        <p>The biggest difference is how those scores are presented.</p>
        <p>
          All Star Points commonly award up to 120 points per boss, accumulating points across a raid. This means the
          maximum possible score depends on how many bosses are included. If someone has 835 All Star Points, is that
          good? It&apos;s difficult to know without understanding the total possible points or comparing them against
          other players.
        </p>
        <p>
          <strong>Chronicle takes a different approach by keeping Peak and Mastery normalized to a 0–100 scale</strong>
          , whether you&apos;re looking at an individual boss, an entire raid, or a Career spanning multiple raids.
        </p>
        <PointsVsScale />
        <p>
          A Peak rating of 90 has an intuitive meaning: you&apos;ve achieved 90% of the best recorded performance
          relative to the relevant benchmarks.
        </p>
        <p>
          This makes it possible to recognize achievements across specializations with vastly different damage or
          healing output. The same approach extends to guilds, where Peak and Mastery measure performance using
          encounter and clear times.
        </p>
        <p>
          <strong>
            My goal is that once you understand what a rating means on your own profile, you can understand it anywhere
            on Chronicle.
          </strong>
        </p>

        <Chapter index={5} />
        <p>There&apos;s another part of the new system that I think deserves some attention: Renown.</p>
        <p>Not every achievement needs to be about how much damage or healing you do.</p>
        <p>
          Some players raid every week. They clear hundreds of bosses, participate in countless raids, and spend
          enormous amounts of time playing with their guilds.
        </p>
        <p>I think that deserves recognition too.</p>
        <p>
          <strong>
            Renown measures how much content you&apos;ve completed, rather than how well you&apos;ve performed.
          </strong>
        </p>
        <p>
          The idea is fairly simple. Each eligible boss kill contributes points toward your Renown, with different
          encounters carrying different awards.
        </p>
        <p>
          It&apos;s a little like DKP, except instead of spending points on loot, you&apos;re accumulating a record of
          your raiding history.
        </p>
        <RenownLedger />
        <p>
          Unlike Peak and Mastery, Renown isn&apos;t a normalized 0–100 performance rating. It&apos;s a cumulative
          measure of participation.
        </p>
        <p>
          Someone who raids consistently over a long period can build substantial Renown without ever needing to achieve
          an exceptional parse.
        </p>
        <p>And that&apos;s intentional.</p>
        <PullQuote>I don&apos;t believe there&apos;s only one way to be a valuable raider.</PullQuote>
        <p>Exceptional performances, consistent performances, and sustained participation are all worth recognizing.</p>
        <RatingTrio />
        <p>
          That&apos;s the broader philosophy behind introducing these different measurements rather than trying to
          define every player&apos;s accomplishments through one number.
        </p>

        <Chapter index={6} />
        <p>Coming back to the original feedback, I think I made a mistake in how I approached the old Armory.</p>
        <p>
          I was trying to solve problems with the way Chronicle summarized performance, and I viewed the old Armory
          primarily through that lens.
        </p>
        <p>But people weren&apos;t only using it to summarize their performance.</p>
        <p>
          They were using it to explore individual parses, review their history, and understand how they performed on
          specific encounters.
        </p>
        <PullQuote>In trying to improve the summary, I removed access to the underlying history.</PullQuote>
        <p>That was the wrong decision.</p>
        <p>I heard that feedback, and I&apos;ve already made changes to address it.</p>
        <p>
          <strong>The old Armory view is back, and I&apos;ve also added some new enhancements.</strong> So this
          wasn&apos;t simply a rollback. I wanted to restore the information people valued while making it easier to
          explore their individual performances.
        </p>
        <ArmoryRewards />
        <p>
          I think that distinction matters because ratings and parse history should complement each other, not compete
          for space.
        </p>
        <p>
          And now that ratings can answer many of the broader performance questions I was previously trying to answer
          through the Armory, I actually see an opportunity to improve parse history further.
        </p>
        <p>
          Rather than asking one interface to summarize everything, I&apos;d like to eventually make the parse-history
          view more focused on exploring individual performances, tracking progress, and understanding what happened
          across different encounters.
        </p>
        <p>There&apos;s a lot of potential there.</p>
        <p>
          Unfortunately, I don&apos;t currently have the time to properly rethink and rebuild that experience in the near
          term. Chronicle is something I develop and maintain in my spare time, and I don&apos;t want to rush into
          another redesign without thinking through how people actually use it.
        </p>
        <p>For now, I hope the restored and enhanced views address the most immediate concerns.</p>
        <p>Longer term, I&apos;d like to build upon them and give players even more insight into their parses.</p>

        <Chapter index={7} />
        <p>I still believe in the direction behind ratings.</p>
        <p>
          I think there&apos;s genuine value in moving beyond individual parses and giving players more ways to
          understand their performance and recognize their achievements.
        </p>
        <p>But that doesn&apos;t mean the current system is perfect.</p>
        <p>
          There are trade-offs in how benchmarks are established, how performances are combined, and how different
          specializations are compared. Those are all things worth examining and improving.
        </p>
        <p>And even a well-designed rating is of limited use if people can&apos;t understand what it means.</p>
        <p>
          I want Chronicle to remain approachable, transparent, and useful, whether you&apos;re competing for the
          highest possible parse, trying to improve your consistency, or simply enjoying raiding with your guild.
        </p>
        <p>
          I appreciate everyone who has taken the time to share feedback, especially when something I&apos;ve changed
          has made the site less useful for them.
        </p>
        <p>My goal with ratings was never to take something away.</p>
        <PullQuote>It was to give players more ways to understand and celebrate what they&apos;ve accomplished.</PullQuote>
        <p>I still believe that&apos;s a worthwhile goal, and I want to keep improving how Chronicle gets there.</p>
        <p>Thanks for being part of the project.</p>
        <p className="font-wow text-2xl" style={{ color: GOLD }}>
          — Steven
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

// Illustrative kills for one spec on one boss. Parses here are simply the share
// of earlier kills you beat, so the numbers below are computed, not typed in.
const FRIDAY_POPULATION = [920, 1080, 1180, 1260, 1330, 1390, 1440, 1500, 1550, 1640];
const SATURDAY_TOP_GUILD = [1720, 1810, 1930];
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
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
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
  const saturday = [...FRIDAY_POPULATION, ...SATURDAY_TOP_GUILD];
  const days = [
    { day: "Friday", note: "Your guild raids", population: FRIDAY_POPULATION, you: YOU, highlight: undefined },
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

function PositionVsDistance() {
  const parse = parseAgainst(FRIDAY_POPULATION, YOU);
  return (
    <Figure label="Position vs distance">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="text-sm font-semibold text-foreground">Parse: your place in the crowd</div>
          <div className="mt-3">
            <DotStrip population={FRIDAY_POPULATION} you={YOU} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Ahead of {FRIDAY_POPULATION.filter((v) => v < YOU).length} of {FRIDAY_POPULATION.length} kills:{" "}
            <strong style={{ color: parseHexColor(parse) }}>parse {parse}</strong>. Moves when the crowd moves.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">Peak: your distance from the best</div>
          <div className="relative mt-5 h-5 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full" style={{ width: "80%", background: PEAK }} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
            <span>0</span>
            <span>you · 1,600</span>
            <span>benchmark · 2,000</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            1,600 ÷ 2,000 = <strong style={{ color: PEAK }}>Peak 80</strong>. Moves only when the record moves.
          </p>
        </div>
      </div>
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

function RatingTrio() {
  const items = [
    {
      name: "Peak",
      color: PEAK,
      Icon: METRIC_THEMES.peak.icon,
      honours: "Exceptional performance",
      question: METRIC_THEMES.peak.question,
      scale: "0–100 against the benchmark",
      flavor: "One perfect pull is enough.",
    },
    {
      name: "Mastery",
      color: MASTERY,
      Icon: METRIC_THEMES.mastery.icon,
      honours: "Consistent performance",
      question: METRIC_THEMES.mastery.question,
      scale: "0–100 against the benchmark",
      flavor: "Again. And again. And again.",
    },
    {
      name: "Renown",
      color: RENOWN,
      Icon: METRIC_THEMES.renown.icon,
      honours: "Sustained participation",
      question: METRIC_THEMES.renown.question,
      scale: "No cap. It only goes up.",
      flavor: "Every kill counts, and keeps counting.",
    },
  ];
  return (
    <div className="not-prose my-8 grid gap-3 sm:grid-cols-3">
      {items.map(({ name, color, Icon, honours, question, scale, flavor }) => (
        <article key={name} className="rounded-lg border-2 border-[#4a4a6a] bg-[#1a1a2e] p-3 text-xs leading-snug shadow-lg">
          <div className="flex items-center gap-2">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded border-2"
              style={{ borderColor: `${color}aa`, background: `${color}22` }}
            >
              <Icon className="size-5" style={{ color }} />
            </span>
            <h4 className="text-base font-semibold" style={{ color }}>
              {name}
            </h4>
          </div>
          <div className="mt-2 text-white">Rating</div>
          <div className="text-white">{honours}</div>
          <div className="mt-1 text-[#1eff00]">{question}</div>
          <div className="mt-1 text-white/80">{scale}</div>
          <div className="mt-2 text-[#ffd200]">&ldquo;{flavor}&rdquo;</div>
        </article>
      ))}
    </div>
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
