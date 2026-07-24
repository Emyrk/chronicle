import { Link } from "react-router-dom";
import { parseColor, parseBgColor } from "@/pages/Instance/parseColors";

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
      <h1 className="text-3xl font-bold mb-2">How Parses Work</h1>
      <p className="text-muted-foreground mb-8">
        A quick guide to parse scores in Chronicle.
      </p>

      {/* What is a parse */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">What Is a Parse?</h2>
        <p className="text-muted-foreground mb-3">
          A parse is a <strong>0–100 score</strong> for your DPS or HPS on a
          boss kill. It tells you how your performance compares to other players
          of your spec (or class, depending on the server) on the same boss,
          difficulty, and raid size.
        </p>
        <p className="text-muted-foreground">
          Higher is better. A score of 100 means you matched or beat the best
          recorded performance in the dataset.
        </p>
      </section>

      {/* How is it computed */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How Is the Score Computed?</h2>
        <p className="text-muted-foreground mb-3">
          Chronicle collects every eligible kill from the{" "}
          <strong>rolling time window (by default, the last 60 days)</strong> on a given boss into a comparison
          cohort — each raid counts as a separate datapoint. Your metric (DPS
          or HPS) is then placed on a 0–100 scale by{" "}
          <strong>linear interpolation</strong> between those values. If you
          match or beat the highest value in the cohort, you score 100.
          Performances with the same metric value receive the same score. On
          small servers this grows the dataset faster than a best-per-player
          approach and matches how parses (vs rankings) conventionally work.
        </p>
        <p className="text-muted-foreground mb-3">
          The 60-day rolling window keeps scores reflecting the{" "}
          <strong>current state of the server</strong> — as gear improves, new
          buffs are discovered, and the player pool evolves, old kills age out
          so the cohort stays relevant. The window is frozen at each daily
          snapshot (see below), so all players in the same raid are compared
          against the same dataset.
        </p>
      </section>

      {/* Why not strict percentile */}
      <section className="mb-8 p-4 bg-muted/30 rounded-lg">
        <h2 className="text-xl font-semibold mb-3">
          Why Not a Strict Rank-Based Percentile?
        </h2>
        <p className="text-muted-foreground mb-3">
          On retail-scale sites like Warcraft Logs, there are thousands of kills
          per boss per spec, so a simple ranking percentile works well. Private
          servers are different: some specs might have only a handful of recorded
          kills on a particular boss.
        </p>
        <p className="text-muted-foreground mb-3">
          A strict ranking would make scores jumpy and unfairly harsh. For
          example, with 10 kills recorded, last place would score near 0 even if
          their DPS was 95% of first place. Value-based interpolation avoids
          this — your score reflects <em>how close</em> you are to the best,
          not just where you rank in a tiny list.
        </p>
        <p className="text-muted-foreground">
          To keep things transparent, Chronicle always shows the{" "}
          <strong>sample size</strong> ("N kills in cohort"). Scores require at
          least <strong>5 kills</strong> in the cohort; with 5–19 kills a{" "}
          <strong>low-confidence indicator</strong> is shown.
        </p>
      </section>

      {/* Daily snapshots */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          Daily Snapshots &amp; Historical Stability
        </h2>
        <p className="text-muted-foreground mb-3">
          Parse scores are computed against a dataset <strong>frozen at
          00:00&nbsp;UTC each day</strong>. A raid is compared against kills
          from the last 60 days uploaded before that day's snapshot. Uploads
          later the same day — or on any future day — never change a raid's
          historical parse scores.
        </p>
        <p className="text-muted-foreground">
          A "current" comparison mode also exists, which uses the latest
          snapshot. Historical scores tell you how you stacked up at the time;
          current scores show where you'd land against today's dataset.
        </p>
      </section>

      {/* Average Parse */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Average Parse</h2>
        <p className="text-muted-foreground mb-3">
          When multiple bosses are selected, the parse pill shows the{" "}
          <strong>arithmetic mean</strong> of your per-boss parses over the
          bosses you killed, along with coverage (e.g. "10/12").
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
          <li>Only <strong>boss kills</strong> are scored — wipes and trash are excluded.</li>
          <li>
            Duplicate uploads of the same raid count once; the best copy is used.
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
