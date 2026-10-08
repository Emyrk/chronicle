import { CircleHelp, Shield } from "lucide-react"
import { specializationIconUrl } from "@/config/specializationIcon"

/** Explains Discipline absorb attribution. Shared by /class-details and the blog. */
export function AbsorbAttributionDetails() {
  return (
    <section className="rounded-xl border border-sky-300/20 bg-sky-400/5 p-5">
      <div className="mb-4 flex items-center gap-3">
        <img
          src={specializationIconUrl("Priest", "Discipline")}
          alt="Discipline Priest specialization icon"
          className="h-11 w-11 rounded-md border border-sky-200/20 object-cover shadow-sm"
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300/80">
            Discipline
          </p>
          <h3 className="text-lg font-semibold">Absorption shield attribution</h3>
        </div>
      </div>

      <p className="leading-relaxed text-muted-foreground">
        Client-side combat logs can report how much damage was absorbed without
        naming the shield that absorbed it. Chronicle estimates the most likely
        active shield so mitigation can be credited to spells such as Power Word:
        Shield instead of remaining unattributed.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-red-400/15 bg-red-500/5 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-red-300/80">
            Raw client log
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            Fire damage: 240 <span className="text-foreground">(150 absorbed)</span>
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            Shield source unknown
          </div>
        </div>

        <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300/80">
            Chronicle estimate
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded bg-orange-400/10 px-2.5 py-2">
              <span className="font-medium text-orange-200">Fire Ward</span>
              <span className="font-semibold tabular-nums">150</span>
            </div>
            <div className="flex items-center justify-between px-2.5 text-muted-foreground">
              <span>Power Word: Shield</span>
              <span>active</span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        For example, if Fire Ward and Power Word: Shield are both active when fire
        damage is absorbed, Chronicle prefers Fire Ward because it specifically
        matches the incoming damage school.
      </p>

      <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-400/10 p-4">
        <div className="mb-2 flex items-center gap-2">
          <CircleHelp className="h-5 w-5 text-amber-300" />
          <h4 className="font-semibold">This is an estimate</h4>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The raw client log does not identify the shield. Missing aura events,
          talent or gear scaling, and private-server spell changes can make the
          active duration or remaining shield capacity uncertain. Chronicle picks
          the best-supported match, but it cannot guarantee every absorb is assigned
          to the correct shield.
        </p>
      </div>
    </section>
  )
}
