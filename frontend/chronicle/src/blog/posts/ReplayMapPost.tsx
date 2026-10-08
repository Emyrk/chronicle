import { Compass, Footprints, Layers3, Play } from "lucide-react";

export function ReplayMapPost() {
  return (
    <article className="pb-24">
      <header className="relative isolate overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-20 bg-[#090d10]" />
        <div className="absolute inset-0 -z-10 opacity-70 [background-image:radial-gradient(circle_at_68%_28%,rgba(77,132,156,0.3),transparent_35%),linear-gradient(115deg,transparent_0_49%,rgba(255,255,255,0.035)_50%,transparent_51%)] [background-size:auto,52px_52px]" />
        <div className="mx-auto grid min-h-[34rem] w-full max-w-6xl items-end gap-12 px-6 py-16 sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-[#83bdd5]">October 8, 2026 · Replay</p>
            <h1 className="mt-5 max-w-3xl font-[Libre_Baskerville] text-4xl leading-[1.05] font-bold tracking-[-0.04em] text-white sm:text-6xl">
              Follow the fight with the replay map
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
              Movement now has a place beside damage, healing, and casts. The new Map panel reconstructs where the raid was standing as the replay cursor moves through an encounter.
            </p>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-sm rotate-2 rounded-[2rem] border border-white/10 bg-[#11191e] p-5 shadow-2xl shadow-black/50">
            <div className="relative h-full overflow-hidden rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_center,#314752_0,#17242a_42%,#0d1418_100%)]">
              <div className="absolute inset-8 rounded-[42%_58%_51%_49%] border border-[#83bdd5]/20 bg-[#1b3038] shadow-[inset_0_0_60px_rgba(0,0,0,0.55)]" />
              {[
                ["24%", "28%", "bg-sky-300"], ["34%", "42%", "bg-emerald-300"], ["51%", "35%", "bg-amber-300"],
                ["62%", "56%", "bg-violet-300"], ["43%", "68%", "bg-rose-300"], ["72%", "31%", "bg-red-500"],
              ].map(([left, top, color]) => (
                <span key={`${left}-${top}`} className={`absolute h-3 w-3 rounded-full ${color} ring-4 ring-black/30`} style={{ left, top }} />
              ))}
              <div className="absolute right-5 bottom-5 left-5 flex items-center gap-3 rounded-full border border-white/10 bg-black/45 px-4 py-3 backdrop-blur">
                <Play className="h-4 w-4 fill-white text-white" />
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full w-2/3 bg-[#83bdd5]" /></div>
                <span className="font-mono text-[10px] text-white/70">02:14</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-6 pt-16 sm:px-10 sm:pt-24">
        <div className="grid gap-10 md:grid-cols-3">
          {[
            [Footprints, "See movement", "Player, pet, and hostile-unit markers advance with the encounter replay instead of reducing positioning to a final snapshot."],
            [Compass, "Keep orientation", "Facing direction travels with each marker, making turns, approaches, and late reactions easier to recognize."],
            [Layers3, "Use the real floor", "Supported encounters use authoritative map artwork and floor bounds rather than stretching positions into an arbitrary rectangle."],
          ].map(([Icon, title, body]) => {
            const FeatureIcon = Icon as typeof Footprints;
            return (
              <section key={title as string}>
                <FeatureIcon className="h-6 w-6 text-primary" />
                <h2 className="mt-5 text-lg font-semibold text-foreground">{title as string}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{body as string}</p>
              </section>
            );
          })}
        </div>

        <section className="mt-20 grid gap-8 border-y border-border py-12 md:grid-cols-[0.72fr_1.28fr] md:py-16">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-primary">Designed for replay</p>
          <div>
            <h2 className="font-[Libre_Baskerville] text-3xl font-bold tracking-[-0.025em] text-foreground">One more way to ask what happened</h2>
            <div className="mt-6 space-y-5 text-base leading-7 text-muted-foreground">
              <p>Combat logs are excellent at telling us what happened and when. Position is the missing axis. The Map panel connects those events to the room they happened in.</p>
              <p>Move the replay cursor to a death, a burst window, or a mechanic. The map follows the same clock as Chronicle’s event panels, giving the numbers geographical context.</p>
            </div>
          </div>
        </section>

        <aside className="mt-14 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 sm:p-8">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Still expanding</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Chronicle only places markers when it has authoritative artwork and coordinate bounds for the active floor. Unsupported floors remain hidden rather than presenting a convincing but inaccurate map.
          </p>
        </aside>
      </div>
    </article>
  );
}
