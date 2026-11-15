import type { BlogPostDefinition } from "../blogRegistry";
import { ShortPost } from "./ShortPost";

type PostProps = { post: BlogPostDefinition };

// Evergreen explainers for players arriving from search engines and AI
// assistants. Every fact is checked against the scoring and ranking code; the
// PR that added them lists the references. Keep them in sync when the rules
// change.

export function ParsesAndRatingsExplainedPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        <strong>
          A Chronicle parse is a 0 to 100 score for one boss kill: it places your DPS or HPS among comparable kills from
          the 60 days before your raid. Peak, Mastery and Renown rate your whole history instead. Peak is your best kill
          against the best your spec has ever done on that boss, Mastery blends your best, typical and weaker kills, and
          Renown adds up points for every boss you have killed.
        </strong>
      </p>

      <h2>What is a parse?</h2>
      <p>
        A parse answers &ldquo;how did this one kill compare?&rdquo; Chronicle collects comparable kills and ranks
        yours among them:
      </p>
      <ul>
        <li>
          <strong>Comparable kills</strong> are kills of the same boss on the same server (every realm of it), at the
          same difficulty and raid size, by the same class and, on most servers, the same spec and subspec. A few
          servers compare by class only.
        </li>
        <li>
          <strong>The window</strong> is the 60 days before your raid started. Your own raid is never part of its own
          comparison.
        </li>
        <li>
          <strong>The score</strong> is your rank position, smoothed between neighbours. Roughly, a 75 means about three
          quarters of the comparable kills were lower than yours. Matching or beating the best kill in the window scores
          100. It is a rank, not a percentage of the top DPS: if most kills are close together, small differences move
          the score a lot.
        </li>
        <li>
          <strong>DPS and HPS are scored separately.</strong> Every player gets a DPS parse and an HPS parse on every
          kill where they did any damage or healing.
        </li>
        <li>
          <strong>Enough data first.</strong> Chronicle needs at least 5 comparable kills to show a parse, and marks it
          low confidence below 20.
        </li>
        <li>
          <strong>Which kills count:</strong> boss kills (including kills where some adds were still alive) from listed,
          valid logs. If several people upload the same raid, it counts once.
        </li>
        <li>
          A kill&apos;s parse is worked out once, against the 60 days before it, and then stays the same. Later kills
          don&apos;t change it.
        </li>
      </ul>
      <p>
        The <a href="/parsing">parsing page</a> has more detail.
      </p>

      <h2>What are Peak, Mastery and Renown?</h2>
      <p>
        Ratings don&apos;t use parses. They compare your raw DPS or HPS to the <strong>benchmark</strong>: the best
        kill anyone of your class, spec and subspec has ever recorded on that boss on your server, at that difficulty
        and raid size. Each kill counts once, as DPS or as HPS (healing specs count whichever is higher; other specs
        always count as DPS). Only clean boss kills count, where every enemy in the fight died.
      </p>
      <ul>
        <li>
          <strong>Peak</strong> is your best kill as a percentage of the benchmark, capped at 100. One great kill is
          enough.
        </li>
        <li>
          <strong>Mastery</strong> is what to expect from you. Chronicle sorts your kills of a boss from worst to best and
          ignores the worst 20%. The next 20% are your <em>Floor</em>, your best kill is your <em>Peak</em>, and
          everything in between is your <em>Form</em>. Mastery is 30% Peak, 50% Form and 20% Floor, each measured
          against the benchmark. With fewer than three kills some of those parts are empty, so Mastery can&apos;t reach
          100 until you have at least three.
        </li>
        <li>
          <strong>Renown</strong> is how much you&apos;ve done. Every boss has a Renown award, and each kill earns it in
          full, however you performed. It adds up across bosses and raids.
        </li>
      </ul>
      <p>For a whole raid or your career:</p>
      <ul>
        <li>
          Peak and Mastery for a raid are the average over all its bosses. A boss you haven&apos;t killed counts as 0.
        </li>
        <li>Across raids, bigger raids weigh more than small ones.</li>
        <li>Each spec you play is rated separately.</li>
        <li>Guilds are rated the same way using kill times: the fastest kill on the server is the benchmark.</li>
      </ul>

      <h2>Why did my rating change?</h2>
      <ul>
        <li>
          <strong>Someone set a new record.</strong> The benchmark covers all time, so it only goes up. When it does,
          everyone else&apos;s Peak and Mastery on that boss dip a little.
        </li>
        <li>
          <strong>A log was removed or invalidated.</strong> Its kills leave your ratings, so Renown can go down too.
        </li>
        <li>
          <strong>Awards or weights were adjusted.</strong> Renown and raid weights are applied when ratings are
          calculated, so a change applies to past kills as well.
        </li>
      </ul>
      <p>
        Ratings appear on servers where Chronicle has set up leaderboards. <a href="/ratings">How Ratings Work</a>{" "}
        walks through them with an example player or your own kills, and your server&apos;s{" "}
        <a href="/stats">stats pages</a> show the numbers behind them.
      </p>
    </ShortPost>
  );
}

export function SpeedrunRulesPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        <strong>
          A raid clear counts as a Chronicle speedrun when one log shows every required boss of that raid killed, on a
          single difficulty, recorded with the Chronicle addon or a server-side logging module, in a listed log whose
          raid is mostly one guild. Boss order and wipes don&apos;t matter. The clock runs from the first pull to the end
          of the last required boss fight.
        </strong>
      </p>

      <h2>What makes a clear valid?</h2>
      <ul>
        <li>
          <strong>Every required kill.</strong> Each raid has a list of required bosses, and a few required trash packs
          or multi-part bosses (for example all three members of a council). Every one must die in the same run. The
          list for each raid is on the Rulesets tab of the leaderboards.
        </li>
        <li>
          <strong>Any order, any number of wipes.</strong> Neither affects whether the run counts. Wipes do cost time.
        </li>
        <li>
          <strong>One difficulty.</strong> A run that mixes difficulties across its boss fights doesn&apos;t qualify.
        </li>
        <li>
          <strong>A trusted data source.</strong> The log must come from the Chronicle addon or a server-side logging
          module. WoW Forever logs use Blizzard&apos;s own combat log format and don&apos;t qualify yet.
        </li>
        <li>
          <strong>A guild run.</strong> Boards show guilds, so the raid needs a guild that has more than half of the
          players who did damage or healing.
        </li>
        <li>
          <strong>Listed and valid.</strong> Unlisted logs stay off the public boards, and invalidating a log or one of
          its fights removes the run.
        </li>
        <li>
          <strong>Level caps where they apply.</strong> Classic raids are capped at level 60 on Wrath and TBC servers,
          and TBC raids at 70 on Wrath servers. Deadmines (level 26) and Ragefire Chasm (level 20) have caps everywhere.
          One player over the cap, or with an unknown level, disqualifies the run.
        </li>
      </ul>

      <h2>How is the time measured?</h2>
      <ul>
        <li>
          <strong>Full raid</strong> (the default) runs from the start of the first fight, trash included, to the end of
          the last fight that killed a required boss. On Ulduar it starts after the Flame Leviathan fight.
        </li>
        <li>
          <strong>Boss time</strong> starts at the first fight that involved a required boss, wipes included.
        </li>
        <li>
          A long break splits a raid into two runs: 6 hours of inactivity in a raid, or 1 hour once every required boss
          is dead. A split clear doesn&apos;t qualify.
        </li>
        <li>
          If several people upload the same raid, the board keeps the fastest copy, then each guild&apos;s best run.
        </li>
      </ul>

      <h2>Do the rules differ between servers?</h2>
      <p>Yes, where a server adds or changes bosses:</p>
      <ul>
        <li>
          <strong>Servers with Turtle WoW content</strong> (Turtle WoW forks and OctoWoW): Molten Core also requires
          Incindis, Basalthar, Smoldaris and Sorcerer-Thane Thaurissan in place of Gehennas. Blackwing Lair adds Ezzel
          Darkbrewer, Onyxia&apos;s Lair adds Broodcommander Axelus, and Deadmines adds the Masterpiece Harvester. These
          servers also have boards for Lower and Upper Karazhan and Timbermaw Hold.
        </li>
        <li>
          <strong>VanillaPlus</strong>: Blackwing Lair adds Krixix, Zul&apos;Gurub adds Azus and The Nameless Hermit,
          and the Scarlet Monastery raid has its own board.
        </li>
        <li>
          <strong>Zul&apos;Gurub</strong> everywhere requires only Bloodlord Mandokir, Jin&apos;do and Hakkar. The High
          Priests are optional.
        </li>
      </ul>

      <h2>When do rule changes apply?</h2>
      <p>
        A run is checked when its log is processed. If the rules change, older runs keep their result until the log is
        processed again.
      </p>
      <p>
        See the <a href="/speedrunning">speedrunning rules</a>, the speedrun boards under{" "}
        <a href="/leaderboards">leaderboards</a>, and your server&apos;s <a href="/stats">stats pages</a>.
      </p>
    </ShortPost>
  );
}

export function TurtleWoWForksPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        <strong>
          Turtle WoW itself closed in May 2026, but its content lives on in fork servers such as CapybaraCraft, OctoWoW
          and Ravencraft. Chronicle shows how actively each one raids on its own stats page, counted from the combat logs
          players upload and refreshed several times a day.
        </strong>
      </p>

      <h2>What is a Turtle WoW fork?</h2>
      <p>
        A fork is a server that runs Turtle WoW&apos;s custom content: extra bosses in Molten Core and Blackwing
        Lair, Karazhan, Timbermaw Hold and more. On Chronicle these servers share Turtle&apos;s boss lists, parses and
        speedrun rules, and each has its own leaderboards.
      </p>

      <h2>Which forks are most active?</h2>
      <p>
        Activity changes week to week, so this post doesn&apos;t freeze a ranking. Each server&apos;s stats page gives
        current numbers, with the date they were computed:
      </p>
      <ul>
        <li>
          <a href="/stats">This server&apos;s stats</a>
        </li>
        <li>
          <a href="https://capy.chronicleclassic.com/stats">CapybaraCraft</a>
        </li>
        <li>
          <a href="https://ravencraft.chronicleclassic.com/stats">Ravencraft</a>
        </li>
        <li>
          OctoWoW and every other server: pick one from the <a href="https://chronicleclassic.com/">server list</a> and
          open its <code>/stats</code> page.
        </li>
      </ul>

      <h2>What do the numbers mean?</h2>
      <ul>
        <li>
          <strong>Seen in uploaded logs, not total population.</strong> Raid and player counts cover the logs players
          chose to upload to Chronicle, so they undercount every server.
        </li>
        <li>
          <strong>Listed logs only.</strong> Unlisted uploads are left out, and a raid uploaded by several players
          counts once.
        </li>
        <li>
          <strong>Small servers may have no page.</strong> Stats pages appear once a server has enough logged activity
          (50 raids or 200 players over the last 180 days).
        </li>
      </ul>
      <p>
        The <a href="/stats/methodology">methodology</a> explains how every number is counted. Want your server
        on the list? <a href="/upload">Upload your raid logs</a>.
      </p>
    </ShortPost>
  );
}
