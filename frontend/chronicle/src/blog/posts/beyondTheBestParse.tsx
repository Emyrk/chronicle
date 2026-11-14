import type { BlogPostDefinition } from "../blogRegistry";
import { ShortPost } from "./ShortPost";

type PostProps = { post: BlogPostDefinition };

/** A letter to the community: the Armory mistake, and why ratings exist. */
export function BeyondTheBestParsePost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        I&apos;ve seen quite a bit of feedback about Chronicle&apos;s new ratings system and the changes to the Armory. I
        want to take some time to address that feedback, explain the motivation behind these changes, and share where
        I&apos;d like to take Chronicle.
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
        <strong>I&apos;ve since restored the old view and added parse history to the toggled view</strong>, making that
        information accessible again while improving on what was there before. That change came directly from your
        feedback.
      </p>
      <p>
        I also recognize that the new ratings aren&apos;t as immediately familiar or easy to understand as parses. I
        could have done a better job introducing the system and explaining what these numbers represent.
      </p>
      <p>With that addressed, I want to explain why I introduced ratings in the first place.</p>

      <h2>Why move beyond parses?</h2>
      <p>
        Parses are useful. They&apos;re familiar, competitive, and a great way to understand how a particular
        performance compares to others.
      </p>
      <p>
        <strong>
          What I&apos;ve struggled with is using parse scores to compare players across different specializations,
          raids, and points in time.
        </strong>
      </p>
      <p>
        The problem isn&apos;t that parses are bad measurements. It&apos;s that their meaning depends on the players and
        performances included in the comparison.
      </p>
      <p>This becomes particularly noticeable on the smaller private servers Chronicle supports.</p>
      <p>
        Once you divide a server&apos;s population by specialization and encounter, some comparison groups can become
        quite small. One specialization might have hundreds of recorded performances, while another has only a fraction
        of that.
      </p>
      <p>
        A 95 parse in one specialization might represent a very different competitive environment than a 95 in another.
        Both scores describe where those performances stand within their respective populations, but that doesn&apos;t
        necessarily make them directly comparable.
      </p>
      <p>
        Smaller populations can also make these comparisons more sensitive to individual results entering or leaving the
        dataset.
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
      <p>
        The same thing happens over longer periods. As performances enter and leave the 60-day window, the population
        changes, and so does the meaning of a particular percentile.
      </p>
      <p>
        This isn&apos;t inherently wrong.{" "}
        <strong>A parse tells you where a performance stands within a particular population at a particular time.</strong>
      </p>
      <p>That&apos;s useful information. But I wanted Chronicle to answer a different question.</p>

      <h2>Distance from the best, rather than position in the population</h2>
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
      <p>
        <strong>Parses measure your position within a population. Peak measures your distance from a benchmark.</strong>
      </p>
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
          By normalizing performance against specialization-specific benchmarks, I wanted to give these numbers a shared
          interpretation.
        </strong>
      </p>
      <p>
        If you understand what an 80 Peak means for your own specialization, you can understand what an 80 Peak means
        for someone else&apos;s: both performances reached 80% of their respective benchmarks.
      </p>
      <p>
        That doesn&apos;t mean both players demonstrated identical skill, or that their encounters were equally
        difficult. But the numbers now answer the same question.
      </p>
      <p>This extends beyond players, too.</p>
      <p>Chronicle also applies Peak and Mastery to guild performance, using encounter and clear times rather than DPS.</p>
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

      <h2>Recognizing more than one exceptional performance</h2>
      <p>Peak is only part of the system.</p>
      <p>
        One thing I&apos;ve always wanted Chronicle to recognize is the difference between having an incredible night
        and performing well consistently.
      </p>
      <p>
        Someone might have one exceptional encounter where everything goes perfectly. Another player might perform very
        well across dozens of encounters without ever achieving that same peak.
      </p>
      <p>Both are accomplishments, but they&apos;re different accomplishments.</p>
      <p>That&apos;s why Mastery exists.</p>
      <p>
        <strong>Peak recognizes your best performance. Mastery considers your broader performance history.</strong>
      </p>
      <p>
        Mastery combines Peak with measurements of your other performances, placing more emphasis on repeatable results
        than a single exceptional kill.
      </p>
      <p>
        Neither number tells the entire story of a player. They&apos;re intended to provide different perspectives on
        performance.
      </p>

      <h2>Comparing achievements across raids and specializations</h2>
      <p>
        The idea of combining your best performances across multiple bosses isn&apos;t new. Other logging platforms, such
        as Warcraft Logs, have a similar system called <strong>All Star Points</strong>.
      </p>
      <p>The biggest difference is how those scores are presented.</p>
      <p>
        All Star Points commonly award up to 120 points per boss, accumulating points across a raid. This means the
        maximum possible score depends on how many bosses are included. If someone has 835 All Star Points, is that
        good? It&apos;s difficult to know without understanding the total possible points or comparing them against
        other players.
      </p>
      <p>
        <strong>Chronicle takes a different approach by keeping Peak and Mastery normalized to a 0–100 scale</strong>,
        whether you&apos;re looking at an individual boss, an entire raid, or a Career spanning multiple raids.
      </p>
      <p>
        A Peak rating of 90 has an intuitive meaning: you&apos;ve achieved 90% of the best recorded performance relative
        to the relevant benchmarks.
      </p>
      <p>
        This makes it possible to recognize achievements across specializations with vastly different damage or healing
        output. The same approach extends to guilds, where Peak and Mastery measure performance using encounter and
        clear times.
      </p>
      <p>
        <strong>
          My goal is that once you understand what a rating means on your own profile, you can understand it anywhere
          on Chronicle.
        </strong>
      </p>

      <h2>Renown: Recognizing participation</h2>
      <p>There&apos;s another part of the new system that I think deserves some attention: Renown.</p>
      <p>Not every achievement needs to be about how much damage or healing you do.</p>
      <p>
        Some players raid every week. They clear hundreds of bosses, participate in countless raids, and spend enormous
        amounts of time playing with their guilds.
      </p>
      <p>I think that deserves recognition too.</p>
      <p>
        <strong>Renown measures how much content you&apos;ve completed, rather than how well you&apos;ve performed.</strong>
      </p>
      <p>
        The idea is fairly simple. Each eligible boss kill contributes points toward your Renown, with different
        encounters carrying different awards.
      </p>
      <p>
        It&apos;s a little like DKP, except instead of spending points on loot, you&apos;re accumulating a record of
        your raiding history.
      </p>
      <p>
        Unlike Peak and Mastery, Renown isn&apos;t a normalized 0–100 performance rating. It&apos;s a cumulative measure
        of participation.
      </p>
      <p>
        Someone who raids consistently over a long period can build substantial Renown without ever needing to achieve
        an exceptional parse.
      </p>
      <p>And that&apos;s intentional.</p>
      <p>
        <strong>I don&apos;t believe there&apos;s only one way to be a valuable raider.</strong>
      </p>
      <p>Exceptional performances, consistent performances, and sustained participation are all worth recognizing.</p>
      <p>
        That&apos;s the broader philosophy behind introducing these different measurements rather than trying to define
        every player&apos;s accomplishments through one number.
      </p>

      <h2>What I got wrong with the Armory</h2>
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
      <p>
        <strong>In trying to improve the summary, I removed access to the underlying history.</strong>
      </p>
      <p>That was the wrong decision.</p>
      <p>I heard that feedback, and I&apos;ve already made changes to address it.</p>
      <p>
        <strong>The old Armory view is back, and I&apos;ve also added some new enhancements.</strong> So this wasn&apos;t
        simply a rollback. I wanted to restore the information people valued while making it easier to explore their
        individual performances.
      </p>
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
        term. Chronicle is something I develop and maintain in my spare time, and I don&apos;t want to rush into another
        redesign without thinking through how people actually use it.
      </p>
      <p>For now, I hope the restored and enhanced views address the most immediate concerns.</p>
      <p>Longer term, I&apos;d like to build upon them and give players even more insight into their parses.</p>

      <h2>Moving forward</h2>
      <p>I still believe in the direction behind ratings.</p>
      <p>
        I think there&apos;s genuine value in moving beyond individual parses and giving players more ways to understand
        their performance and recognize their achievements.
      </p>
      <p>But that doesn&apos;t mean the current system is perfect.</p>
      <p>
        There are trade-offs in how benchmarks are established, how performances are combined, and how different
        specializations are compared. Those are all things worth examining and improving.
      </p>
      <p>And even a well-designed rating is of limited use if people can&apos;t understand what it means.</p>
      <p>
        I want Chronicle to remain approachable, transparent, and useful, whether you&apos;re competing for the highest
        possible parse, trying to improve your consistency, or simply enjoying raiding with your guild.
      </p>
      <p>
        I appreciate everyone who has taken the time to share feedback, especially when something I&apos;ve changed has
        made the site less useful for them.
      </p>
      <p>My goal with ratings was never to take something away.</p>
      <p>
        <strong>It was to give players more ways to understand and celebrate what they&apos;ve accomplished.</strong>
      </p>
      <p>I still believe that&apos;s a worthwhile goal, and I want to keep improving how Chronicle gets there.</p>
      <p>Thanks for being part of the project.</p>
      <p>— Steven</p>
    </ShortPost>
  );
}
