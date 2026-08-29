import { Check, Clock3, Flag, Skull, Swords, Trophy } from "lucide-react"

function SpeedrunTimingDiagram() {
  return (
    <figure className="mb-8 overflow-hidden rounded-2xl border border-sky-400/20 bg-[#071521] shadow-xl shadow-black/20">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.18),transparent_42%)] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-sky-100">
          <Clock3 className="h-4 w-4 text-sky-400" />
          Complete uploaded raid log
        </div>
        <p className="mt-1 text-xs text-slate-400">
          One upload produces both timing modes.
        </p>
      </div>

      <div className="styled-scrollbar overflow-x-auto px-5 pb-6 pt-7 sm:px-6">
        <div className="min-w-[640px]">
          <div className="grid h-20 grid-cols-[1.1fr_2.8fr_1fr] overflow-hidden rounded-xl border border-white/10 bg-slate-950/70">
            <div className="flex items-center justify-center gap-2 border-r border-amber-300/20 bg-amber-500/15 px-3 text-center text-amber-100">
              <Swords className="h-5 w-5 shrink-0 text-amber-400" />
              <span className="text-sm font-semibold">Pre-boss trash</span>
            </div>

            <div className="flex items-center bg-sky-500/10 px-4 text-sky-100">
              <div className="flex w-28 shrink-0 flex-col items-center gap-1 text-center">
                <span className="grid h-9 w-9 place-items-center rounded-full border border-sky-300 bg-sky-500/25">
                  <Skull className="h-5 w-5 text-sky-200" />
                </span>
                <span className="text-[11px] font-semibold leading-tight">
                  First required boss pull
                </span>
              </div>
              <div className="mx-3 h-px flex-1 bg-sky-300/40" />
              <div className="flex w-28 shrink-0 flex-col items-center gap-1 text-center">
                <span className="grid h-9 w-9 place-items-center rounded-full border border-rose-300 bg-rose-500/20">
                  <Trophy className="h-5 w-5 text-rose-200" />
                </span>
                <span className="text-[11px] font-semibold leading-tight">
                  Final required boss ends
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 border-l border-violet-300/20 bg-violet-500/15 px-3 text-center text-violet-100">
              <Flag className="h-4 w-4 shrink-0 text-violet-300" />
              <span className="text-sm font-semibold">Trailing required trash</span>
            </div>
          </div>

          <div className="grid grid-cols-[1.1fr_2.8fr_1fr] px-2">
            <div />
            <div className="relative mx-3 h-12 border-x-2 border-b-2 border-emerald-400">
              <span className="absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-950 shadow-lg shadow-emerald-950/50">
                Boss time
              </span>
            </div>
            <div />
          </div>

          <div className="grid grid-cols-[1.1fr_2.8fr_1fr]">
            <div className="relative col-span-2 mx-2 mt-7 h-12 border-x-2 border-b-2 border-sky-400/80">
              <span className="absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap rounded-full bg-sky-400 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-950 shadow-lg shadow-sky-950/50">
                Full raid
              </span>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Check className="h-4 w-4 text-emerald-400" />
            Required boss and trash kills still determine qualification.
          </div>
        </div>
      </div>

      <figcaption className="border-t border-white/10 bg-white/[0.025] px-5 py-3 text-xs leading-relaxed text-slate-400 sm:px-6">
        Early and trailing trash remain in the log and count as proof. Boss time
        excludes early trash; both timers stop when the final required boss ends.
      </figcaption>
    </figure>
  )
}

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

      <SpeedrunTimingDiagram />

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
              encounter containing the final required boss kill ends. It includes
              activity before the first boss, but never extends past the final boss.
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
          both timing modes from the same run and stop each timer at the final boss.
        </p>
      </section>
    </div>
  )
}
