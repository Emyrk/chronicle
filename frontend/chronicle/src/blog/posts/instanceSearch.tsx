import type { BlogPostDefinition } from "../blogRegistry";
import { ShortPost } from "./ShortPost";

/*
 * DRAFT, not registered. To publish: add metadata to each
 * assets/<tenant>/generated/blog-posts.json (draft values are in
 * instanceSearch.stories.tsx), map "instance-search" to InstanceSearchPost in
 * BLOG_COMPONENTS and to the video in BLOG_VIDEOS (blogRegistry.ts, 970
 * frames), and add a What's New entry.
 */

type PostProps = { post: BlogPostDefinition };

export function InstanceSearchPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        <a href="/search">Instance search</a> finds raids across Chronicle by almost anything we track: the zone,
        which bosses died and how fast, clear-time and kill-time parses, who was in the raid and what they played. Then
        it tells you <strong>why</strong> each run matched.
      </p>

      <h2>The form</h2>
      <p>Start with the form. Every box is optional; fill in what you care about.</p>
      <ul>
        <li>
          <strong>Run</strong>: zone, guild, realm, date range and difficulty. Pick a zone from the list of supported
          raids, or type part of a name: <em>molten</em> finds Molten Core.
        </li>
        <li>
          <strong>Bosses &amp; speed</strong>: bosses killed, bosses never wiped on, clear-time and kill-time parses
          against the server, realm or guild (on any or each of the bosses you pick), clear time and idle time.
        </li>
        <li>
          <strong>Roster</strong>: at least so many of a class and spec (including sub-specs like Bear and Cat), named
          players, or guild members.
        </li>
        <li>
          <strong>Log capabilities</strong>: logs that recorded, say, unit positions, for runs you can watch in the
          replay.
        </li>
      </ul>
      <p>
        <strong>Search</strong> folds the form into a one-line summary and lists the runs, newest first. Duplicate
        uploads of the same night show once, and clicking a run opens it in a new tab so your results stay put. The
        search lives in the page&apos;s address, so you can share a link to it.
      </p>

      <h2>Why it matched</h2>
      <p>
        Click the arrow at the start of a run to see why it&apos;s there. Every condition gets a check or a cross, with
        the run&apos;s real numbers: the kill-time parse on each boss, the clear time, and for roster conditions, the
        players who counted, with what they played on each fight.
      </p>

      <h2>Blocks and code</h2>
      <p>The form covers the common questions. For everything else there are blocks and code.</p>
      <ul>
        <li>
          <strong>Blocks</strong> combine conditions with <em>and</em>, <em>or</em> and <em>not</em>. A{" "}
          <em>player</em> block makes every condition inside it refer to the same player, so you can find a druid who
          tanked trash as a Bear and went Cat on the bosses. <em>Pull</em> blocks do the same for a single attempt:
          Ragnaros on the first pull, or no wipes at all. Search for any field by name, and use ranges for dates and
          numbers, like a clear time between 60 and 75 minutes.
        </li>
        <li>
          <strong>Code</strong> is the same search as text. Switch between blocks and code at any time; each turns into
          the other.
        </li>
        <li>
          <strong>Examples</strong> load ready-made searches to learn from or tweak, and <strong>Recent</strong>{" "}
          brings back your last ten searches.
        </li>
      </ul>

      <h2>Who gets what</h2>
      <p>
        The form and &quot;why it matched&quot; are free for everyone with an account. Logged out, you can search by
        zone, guild, realm, date and difficulty.
      </p>
      <p>
        Blocks, Code and Examples are a perk for <strong>Honored</strong> supporters and above.{" "}
        <a href="/supporter">Become a supporter</a> to build your own. Anyone logged in can still open and run a
        block or code search someone shares with them.
      </p>

      <h2>Search budget</h2>
      <p>
        Searches spend from a budget that refills over time, shown at the top of the page. Simple searches cost a
        little; complex ones, like parses across many players, cost more. If you run out, wait a moment and it refills.
      </p>

      <p>
        <strong>Tell us what you search for!</strong> If a question can&apos;t be asked yet, it&apos;s probably a field
        we can add.
      </p>
    </ShortPost>
  );
}
