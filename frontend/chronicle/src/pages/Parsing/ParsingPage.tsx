import { Link } from "react-router-dom";
import { parseColor, parseBgColor } from "@/pages/Instance/parseColors";
import { ToolsBackLink } from "@/pages/Tools/ToolsBackLink";

/**
 * Color tier legend data, matching WCL-standard breakpoints.
 */
const COLOR_TIERS: { label: string; min: number; max: number; representative: number }[] = [
  { label: "Grey", min: 0, max: 24, representative: 10 },
  { label: "Green", min: 25, max: 49, representative: 30 },
  { label: "Blue", min: 50, max: 74, representative: 60 },
  { label: "Purple", min: 75, max: 94, representative: 80 },
  { label: "Orange", min: 95, max: 98, representative: 96 },
  { label: "Pink", min: 99, max: 99, representative: 99 },
  { label: "Gold", min: 100, max: 100, representative: 100 },
];

export function ParsingPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <ToolsBackLink className="mb-5" />

      <h1 className="text-3xl font-bold mb-2">How Parses Work</h1>
      <p className="text-muted-foreground mb-8">
        A quick guide to parse scores in Chronicle.
      </p>

      {/* What is a parse */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">What Is a Parse?</h2>
        <p className="text-muted-foreground mb-3">
          A parse is a <strong>0–100 score</strong> for your DPS or HPS on one
          boss kill. It places your kill among comparable kills from the 60
          days before your raid: same boss, difficulty, and raid size, by the
          same spec (or class, depending on the server).
        </p>
        <p className="text-muted-foreground">
          Higher is better. A score of 100 means you matched or beat the best
          comparable kill in that window. DPS and HPS are scored separately:
          every player gets a DPS parse and an HPS parse on each kill where
          they did any damage or healing.
        </p>
      </section>

      {/* How is it computed */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How Is the Score Computed?</h2>
        <p className="text-muted-foreground mb-3">
          Chronicle collects every comparable kill from the{" "}
          <strong>60 days before your raid started</strong> into a comparison
          cohort. Your own raid is never part of its own cohort. Comparable
          kills are kills of the same boss on the same server (every realm of
          it), at the same difficulty and raid size, by the same class and, on
          most servers, the same spec and subspec. Every kill is a separate
          datapoint, not just each player&apos;s best, so a cohort fills up
          faster on small servers.
        </p>
        <p className="text-muted-foreground mb-3">
          The score is your <strong>rank position</strong> in that cohort,
          smoothed between neighbours. Kills are sorted by DPS or HPS, and each
          one gets the position (rank − 0.5) ÷ number of kills, counting from
          the lowest, so tied kills
          share the average of their positions. Your value is placed on that
          scale by <strong>linear interpolation</strong> between the two
          kills either side of it. Roughly, a 75 means about three quarters of
          the comparable kills were lower than yours. Matching or beating the
          best kill in the cohort scores 100.
        </p>
        <p className="text-muted-foreground mb-3">
          The 60-day window keeps scores reflecting the{" "}
          <strong>current state of the server</strong>: as gear improves, new
          buffs are discovered, and the player pool evolves, old kills age out.
          Everyone in a raid is compared over the same dates, each against the
          kills of their own class or spec.
        </p>
      </section>

      {/* Rank, not percent of best */}
      <section className="mb-8 p-4 bg-muted/30 rounded-lg">
        <h2 className="text-xl font-semibold mb-3">
          A Rank, Not a Percentage of the Best
        </h2>
        <p className="text-muted-foreground mb-3">
          A parse is not your DPS as a percentage of the top DPS. It is where
          your kill ranks, so it depends on how the other kills are spread. If
          most comparable kills are close together, small differences move the
          score a lot. With 10 comparable kills, a kill that only equals
          the lowest of them scores about 5, however close its DPS is to the best.
        </p>
        <p className="text-muted-foreground mb-3">
          Private servers can have only a handful of recorded kills for a spec
          on a boss, which makes scores jumpy. To keep that visible, Chronicle
          shows the <strong>sample size</strong> (&quot;N kills in cohort&quot;).
          A parse needs at least <strong>5 comparable kills</strong>, and with
          5–19 kills it is marked <strong>low confidence</strong>.
        </p>
        <p className="text-muted-foreground">
          Peak, Mastery, and Renown work differently: they compare your raw
          performance with the best ever recorded rather than ranking it. See{" "}
          <Link to="/ratings" className="text-blue-400 hover:text-blue-300 font-medium">
            How Ratings Work
          </Link>
          .
        </p>
      </section>

      {/* Stored parses */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          When a Parse Is Worked Out
        </h2>
        <p className="text-muted-foreground mb-3">
          A kill&apos;s parse is worked out <strong>once</strong>, when its log
          is processed, against the kills Chronicle knew about in the 60 days
          before that raid started. For example, a raid on October 1 is
          compared against eligible kills from the preceding 60 days.
        </p>
        <p className="text-muted-foreground">
          After that it stays the same. Later kills, historical logs uploaded
          afterwards, and invalidated duplicates don&apos;t change it. A kill
          that had fewer than 5 comparable kills at the time has no parse, and
          doesn&apos;t get one later.
        </p>
      </section>

      {/* Average Parse */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Average Parse</h2>
        <p className="text-muted-foreground mb-3">
          When multiple bosses are selected, the parse pill shows the{" "}
          <strong>arithmetic mean</strong> of your per-boss parses over the
          bosses you have a parse for, along with coverage (e.g. "10/12").
        </p>
        <p className="text-muted-foreground">
          Partial clears always count for the bosses they include — you're never
          penalized for bosses your raid didn't attempt.
        </p>
      </section>

      {/* Eligibility */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Eligibility</h2>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>
            Only <strong>boss kills</strong> are scored, including kills where
            some adds were still alive. Wipes and trash are excluded.
          </li>
          <li>
            Only listed, valid logs count. Unlisted logs are not scored, and
            invalidated logs are left out of comparisons.
          </li>
          <li>
            Duplicate uploads of the same raid count once; the copy that
            covers the most bosses is used.
          </li>
          <li>
            Players with an unknown spec are not scored on servers that use
            spec-based cohorts.
          </li>
          <li>
            Server admins can configure class-based scoring or disable parses
            entirely.
          </li>
        </ul>
      </section>

      {/* Color legend */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Color Tiers</h2>
        <p className="text-muted-foreground mb-4">
          Parse pills are color-coded using the standard tier system:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {COLOR_TIERS.map((tier) => (
            <div
              key={tier.label}
              className={`flex items-center gap-2 rounded px-3 py-2 ${parseBgColor(tier.representative)}`}
            >
              <span
                className={`font-semibold tabular-nums ${parseColor(tier.representative)}`}
              >
                {tier.min === tier.max ? tier.min : `${tier.min}–${tier.max}`}
              </span>
              <span className="text-sm text-muted-foreground">{tier.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Cohort viewer link */}
      <section className="mb-8 p-4 bg-muted/30 rounded-lg">
        <p className="text-muted-foreground">
          Want to see the raw data?{" "}
          <Link to="/parsing/cohorts" className="text-blue-400 hover:text-blue-300 font-medium">
            Browse the cohort viewer
          </Link>{" "}
          to inspect the actual values and computed scores behind each parse bucket.
        </p>
      </section>
    </div>
  );
}
