export function SpeedrunningPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold">How Speedrunning Works</h1>
      <p className="mb-8 text-muted-foreground">
        A guide to how Chronicle qualifies, times, and ranks complete raid logs.
      </p>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Upload the Complete Raid</h2>
        <p className="mb-3 text-muted-foreground">
          You do not need to trim trash before the first boss from your combat
          log. Chronicle separates the time used for competitive boss rankings
          from the time taken to complete the entire raid.
        </p>
        <p className="text-muted-foreground">
          Keeping the complete log gives Chronicle the evidence it needs to
          verify every required boss and trash kill without penalizing your Boss
          time for clearing trash before the first required boss.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">The Two Timing Modes</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-5">
            <h3 className="mb-2 font-semibold">Boss time</h3>
            <p className="text-sm text-muted-foreground">
              Starts when your raid first pulls a required boss and ends when
              the encounter containing the final required boss kill ends. A wipe
              on that first boss does not reset the start of the timer.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <h3 className="mb-2 font-semibold">Full raid</h3>
            <p className="text-sm text-muted-foreground">
              Starts with the first tracked fight in the raid and ends when the
              final speedrun requirement is completed. This includes required
              trash cleared before the first boss or after the final boss.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8 rounded-lg bg-muted/30 p-4">
        <h2 className="mb-3 text-xl font-semibold">Why Boss Time Is the Default</h2>
        <p className="mb-3 text-muted-foreground">
          Ranking the entire clear made an otherwise identical run appear faster
          when the uploader removed early trash from the log. That rewarded log
          editing instead of faster play.
        </p>
        <p className="text-muted-foreground">
          Boss time anchors every run to required boss encounters, so raids can
          upload the activity they actually played. Full raid remains available
          when you want to compare complete clear times.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Qualification</h2>
        <p className="mb-3 text-muted-foreground">
          A run qualifies only after it satisfies every requirement configured
          for that raid. Requirements can include:
        </p>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>
            Every <strong>required boss kill</strong>
          </li>
          <li>
            The configured number of <strong>required trash kills</strong>
          </li>
          <li>
            Any configured <strong>player level restrictions</strong>
          </li>
        </ul>
        <p className="mt-3 text-muted-foreground">
          The Speedrun panel on an uploaded raid shows the proof Chronicle
          recorded for each boss and trash requirement. Qualified runs must also
          meet the leaderboard&apos;s supported parser and addon versions to appear
          in the rankings.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">How the Leaderboard Toggle Works</h2>
        <p className="text-muted-foreground">
          Selecting Boss time or Full raid re-ranks the leaderboard using that
          duration. The toggle changes the actual ordering of raid previews,
          podiums, and results—not only the time displayed beside each run.
        </p>
      </section>

      <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
        <h2 className="mb-2 text-lg font-semibold text-emerald-300">
          Recommended workflow
        </h2>
        <p className="text-muted-foreground">
          Start logging before the raid begins, keep logging through all required
          bosses and trash, and upload the complete file. Chronicle will calculate
          both timing modes from the same run.
        </p>
      </section>
    </div>
  )
}
