import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes";
import type { BlogPostDefinition } from "../blogRegistry";
import { ShortPost } from "./ShortPost";

type PostProps = { post: BlogPostDefinition };

/** The ratings FAQ on the main site. The blog is a separate app, so this is a plain document link. */
const FAQ = "/ratings/faq";

const RATINGS = [
  {
    metric: "peak" as const,
    question: "How high have you reached?",
    body: "Your best parse on each boss. One great kill is enough, and it holds until you beat it.",
  },
  {
    metric: "mastery" as const,
    question: "What do you reliably deliver?",
    body: "Your typical play, your best, and your weaker nights together.",
  },
  {
    metric: "renown" as const,
    question: "What have you been seen doing?",
    body: "Bosses killed, how often you return, and full clears. It never looks at your parses.",
  },
];

/**
 * Launch post for ratings and the rebuilt leaderboards. Written for launch day: register it in
 * blog-posts.json and BLOG_COMPONENTS when ratings ship.
 */
export function RatingsLaunchPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        A parse is a snapshot of a single kill on a single night. Today Chronicle adds <strong>ratings</strong>: three
        numbers that span many raid nights, each answering a different question.
      </p>

      <div className="not-prose my-8 grid gap-3 sm:grid-cols-3">
        {RATINGS.map(({ metric, question, body }) => {
          const t = METRIC_THEMES[metric];
          return (
            <div
              key={metric}
              className="rounded-lg border border-border bg-card p-4"
              style={{ boxShadow: `inset 0 2px 0 ${t.accent}` }}
            >
              <div className="flex items-center gap-2">
                <t.icon className="size-4" style={{ color: t.accent }} />
                <span className="font-wow text-lg" style={{ color: t.accent }}>
                  {t.label}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">{question}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          );
        })}
      </div>

      <p>
        Why three? Because one number cannot answer all of them honestly. A player with one perfect kill and a player
        who parses 90 every week are both impressive, in different ways. Peak celebrates the first, Ranked Mastery the
        second, and Renown rewards showing up week after week.
      </p>

      <h2>A closer look</h2>
      <ul>
        <li>
          <strong>Peak</strong> is your best kill. A raid's Peak averages every boss, so it rewards a full set of strong
          kills.
        </li>
        <li>
          <strong>Ranked Mastery</strong> blends your Peak, your typical recent play (Form), and your weaker nights
          (Floor). Until you have five kills on a boss, it is held back a little; the leaderboards show this as{" "}
          <strong>Evidence</strong>.
        </li>
        <li>
          <strong>Renown</strong> is your raiding career: bosses, repeat kills, and full clears. It is history, not
          skill.
        </li>
      </ul>
      <p>
        Peak and Ranked Mastery compare you with your own spec and subspec. Every rating is per realm and covers the
        last 180 days by default; switch to All time to see everything.
      </p>

      <h2>Rebuilt leaderboards</h2>
      <p>
        The <a href="/leaderboards">leaderboards</a> are rebuilt around ratings. Every instance now has one page where a
        single set of filters drives every tab:
      </p>
      <ul>
        <li>
          <strong>Pick an encounter</strong>: the full clear, one boss, or several bosses combined.
        </li>
        <li>
          <strong>Pick a class</strong> by its icon, then a spec and subspec. DPS or healing, characters or guilds.
        </li>
        <li>
          <strong>Pick your realm</strong> once; it is remembered for next time.
        </li>
        <li>
          <strong>Overview</strong> shows the fastest clears, the rating leaders, best performances, and a card for
          every boss. Pick a class to see how each of its specs stands.
        </li>
        <li>
          <strong>Ratings</strong> has a board per rating and a full table you can search and sort. Performances,
          Speedruns, Statistics, Parsing, and Rulesets live next door.
        </li>
      </ul>

      <h2>Guilds get ratings too</h2>
      <p>
        Switch to <strong>Guilds</strong> and the same three ratings rank guilds. A guild's parse is its run time: the
        fastest run on the realm scores 100. Guild Mastery rewards fast clears week after week, and Guild Renown rewards
        a long raiding history.
      </p>

      <h2>How it all works</h2>
      <p>
        The <a href={FAQ}>ratings FAQ</a> explains each rating in detail, with worked examples and calculators you can
        play with: see how Form and Floor move your Ranked Mastery, what a missing boss does to a raid Peak, and how
        Renown grows.
      </p>
      <p>
        <strong>Please share your feedback!</strong> The formulas may be tuned as more data comes in.
      </p>
    </ShortPost>
  );
}
