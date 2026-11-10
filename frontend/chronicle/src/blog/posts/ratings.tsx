import type { BlogPostDefinition } from "../blogRegistry";
import { ShortPost } from "./ShortPost";

type PostProps = { post: BlogPostDefinition };

const PEAK = "#e2b25a";
const MASTERY = "#72aac6";
const RENOWN = "#b394e6";

export function RatingsPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        Chronicle now rates players across their whole history, not just one kill at a time. There are three ratings:{" "}
        <strong style={{ color: PEAK }}>Peak</strong>, <strong style={{ color: MASTERY }}>Mastery</strong> and{" "}
        <strong style={{ color: RENOWN }}>Renown</strong>. The new <a href="/ratings">How Ratings Work</a> page explains
        each one with an example player, or with your own kills.
      </p>

      <h2>Two numbers per kill</h2>
      <p>Everything starts with what you did on a single boss kill:</p>
      <ul>
        <li>
          <strong>Performance</strong> is your raw DPS or HPS on that kill.
        </li>
        <li>
          <strong>Parse</strong> scores that performance from 0 to 100 against kills from the 60 days before the raid.
          It tells you how one kill stacked up at the time.
        </li>
      </ul>
      <p>
        Ratings don&apos;t use parses. They go back to your raw performance and compare it to the{" "}
        <strong>benchmark</strong>: the best DPS or HPS anyone of your spec on your server has ever done on that boss.
      </p>

      <h2>Three ratings for your history</h2>
      <ul>
        <li>
          <strong style={{ color: PEAK }}>Peak</strong> answers &ldquo;What is the best I have ever done?&rdquo; It&apos;s
          your single best kill against the benchmark, capped at 100. One great kill is enough.
        </li>
        <li>
          <strong style={{ color: MASTERY }}>Mastery</strong> answers &ldquo;What performance is to be expected of this
          player?&rdquo; Sort your kills from worst to best. The worst 20% are ignored, the next 20% are your Floor, your
          best kill is your Peak, and everything between is your Form. Mastery blends them: 30% Peak, 50% Form and 20%
          Floor, each against the benchmark.
        </li>
        <li>
          <strong style={{ color: RENOWN }}>Renown</strong> answers &ldquo;How much content has this player done?&rdquo;
          Every boss has a Renown award, and each kill earns it, however you performed. Harder bosses are worth more.
          Renown only goes up.
        </li>
      </ul>

      <h2>Try it with your own kills</h2>
      <p>
        The page opens on an example Fury Warrior&apos;s Nefarian kills. Click through the lenses to see the same kills
        as Performance, Parse, Peak, Mastery and Renown, and drag the slider to see how the ratings change with more
        kills. Switch to <strong>My data</strong> to load the kills of a character you&apos;ve linked: pick a raid and a
        boss, and every number on the page is yours.
      </p>

      <h2>Why ratings change</h2>
      <p>
        The benchmark covers all time, so it only goes up. When someone sets a new record, everyone else&apos;s Peak and
        Mastery on that boss dip a little, even if they haven&apos;t raided since. Your kills and their parses stay the
        same. The page has a slider to try it.
      </p>

      <h2>The fine print</h2>
      <ul>
        <li>
          You&apos;re compared against your <strong>cohort</strong>: the same server, boss, difficulty, raid size, class,
          spec and subspec. If you play more than one spec, each is rated separately.
        </li>
        <li>
          Each kill counts toward DPS <em>or</em> HPS, whichever is higher for that kill, never both.
        </li>
        <li>
          Over several bosses, Peak and Mastery are the average across every boss, and a boss you haven&apos;t killed
          counts as 0. Renown just adds up.
        </li>
        <li>Guilds are rated the same way, using kill times instead of DPS.</li>
        <li>
          Only clean boss kills count, and duplicate uploads of the same raid count once. There are no seasons: ratings
          cover your whole history.
        </li>
      </ul>
      <p>
        <a href="/ratings">Read How Ratings Work</a> for the details, including why even perfect kills can&apos;t reach
        100 Mastery until you have three.
      </p>
    </ShortPost>
  );
}
