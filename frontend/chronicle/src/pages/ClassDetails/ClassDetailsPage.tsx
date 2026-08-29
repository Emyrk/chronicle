import { useState } from "react"
import { ArrowLeft, ChevronRight, CircleHelp, Eye, Shield, Sparkles } from "lucide-react"
import { Link } from "react-router-dom"
import { specializationIconUrl } from "@/config/specializationIcon"

const PALADIN_COLOR = "var(--color-class-paladin)"
const PRIEST_COLOR = "var(--color-class-priest)"

type CreditedClass = "PALADIN" | "ROGUE"

const ATTRIBUTION_PLAYERS = [
  {
    className: "PALADIN" as const,
    name: "Paladin",
    icon: "/c/icons/class_paladin.png",
    color: "var(--color-class-paladin)",
  },
  {
    className: "ROGUE" as const,
    name: "Rogue",
    icon: "/c/icons/class_rogue.png",
    color: "var(--color-class-rogue)",
  },
]

function AttributionBars({ creditedClass }: { creditedClass: CreditedClass }) {
  return (
    <div className="mt-4 space-y-2" aria-label="Example healing attribution">
      {ATTRIBUTION_PLAYERS.map((player) => {
        const credited = player.className === creditedClass
        return (
          <div key={player.className} className="flex items-center gap-2">
            <img
              src={player.icon}
              alt=""
              aria-hidden="true"
              className="h-7 w-7 rounded border border-white/10 object-cover"
            />
            <div className="relative h-8 min-w-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-black/20">
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-500"
                style={{
                  width: credited ? "100%" : "0%",
                  backgroundColor: `color-mix(in srgb, ${player.color} 32%, transparent)`,
                }}
              />
              <div className="relative flex h-full items-center justify-between gap-3 px-2.5 text-xs">
                <span className="font-semibold" style={{ color: player.color }}>
                  {player.name}
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {credited ? "61" : "—"}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ClassDetailsPage() {
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const paladinSelected = selectedClass === "PALADIN"
  const priestSelected = selectedClass === "PRIEST"

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link
        to="/tools"
        className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Tools &amp; FAQ
      </Link>

      <div className="mb-8 max-w-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Combat log behavior
        </p>
        <h1 className="mb-3 text-3xl font-bold">Class details</h1>
        <p className="text-muted-foreground">
          Learn how Chronicle interprets class mechanics that need special attribution or
          handling beyond the raw combat log.
        </p>
      </div>

      <section aria-labelledby="choose-class" className="mb-8">
        <h2 id="choose-class" className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Choose a class
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            aria-expanded={paladinSelected}
            aria-controls="paladin-details"
            onClick={() => setSelectedClass(paladinSelected ? null : "PALADIN")}
            className={`group flex w-full max-w-sm cursor-pointer items-center gap-4 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/70 ${
              paladinSelected
                ? "border-pink-300/50 bg-pink-300/10 shadow-lg shadow-pink-950/20"
                : "bg-card hover:border-pink-300/30 hover:bg-pink-300/5"
            }`}
          >
            <img
              src="/c/icons/class_paladin.png"
              alt=""
              aria-hidden="true"
              className="h-16 w-16 rounded-lg border border-white/15 object-cover shadow-md transition-transform group-hover:scale-105"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Class
              </span>
              <span className="block text-lg font-bold" style={{ color: PALADIN_COLOR }}>
                Paladin
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                Holy combat log attribution
              </span>
            </span>
            <ChevronRight
              className={`h-5 w-5 text-muted-foreground transition-transform ${paladinSelected ? "rotate-90 text-pink-200" : ""}`}
            />
          </button>
          <button
            type="button"
            aria-expanded={priestSelected}
            aria-controls="priest-details"
            onClick={() => setSelectedClass(priestSelected ? null : "PRIEST")}
            className={`group flex w-full max-w-sm cursor-pointer items-center gap-4 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              priestSelected
                ? "border-white/40 bg-white/10 shadow-lg shadow-black/20"
                : "bg-card hover:border-white/25 hover:bg-white/5"
            }`}
          >
            <img
              src="/c/icons/class_priest.png"
              alt=""
              aria-hidden="true"
              className="h-16 w-16 rounded-lg border border-white/15 object-cover shadow-md transition-transform group-hover:scale-105"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Class
              </span>
              <span className="block text-lg font-bold" style={{ color: PRIEST_COLOR }}>
                Priest
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                Shields and Mind Control
              </span>
            </span>
            <ChevronRight
              className={`h-5 w-5 text-muted-foreground transition-transform ${priestSelected ? "rotate-90 text-white" : ""}`}
            />
          </button>
        </div>
      </section>

      {paladinSelected && (
        <section
          id="paladin-details"
          aria-labelledby="holy-paladin-heading"
          className="overflow-hidden rounded-2xl border border-amber-300/20 bg-[radial-gradient(circle_at_100%_0%,rgba(251,191,36,0.12),transparent_36%)] shadow-xl shadow-black/10"
        >
          <div className="flex items-center gap-4 border-b border-border/70 bg-card/70 p-5 sm:p-6">
            <img
              src={specializationIconUrl("Paladin", "Holy")}
              alt="Holy Paladin specialization icon"
              className="h-14 w-14 rounded-lg border border-amber-200/20 object-cover shadow-md"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                Paladin specialization
              </p>
              <h2 id="holy-paladin-heading" className="text-2xl font-bold">
                Holy
              </h2>
            </div>
          </div>

          <div className="space-y-6 p-5 sm:p-6">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-300" />
                <h3 className="text-lg font-semibold">Judgement of Light</h3>
              </div>
              <p className="leading-relaxed text-muted-foreground">
                Judgement of Light healing can be reported as healing done by the paladin
                who applied the debuff. Chronicle instead
                credits each heal to the player whose attack triggered it, which
                is also the player receiving the heal.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-red-400/15 bg-red-500/5 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-red-300/80">
                  Raw log attribution
                </p>
                <p className="text-sm text-muted-foreground">
                  The paladin who placed Judgement of Light receives the healing credit.
                </p>
                <AttributionBars creditedClass="PALADIN" />
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300/80">
                  Chronicle attribution
                </p>
                <p className="text-sm text-muted-foreground">
                  The attacking player who triggered and received the heal gets the credit.
                </p>
                <AttributionBars creditedClass="ROGUE" />
              </div>
            </div>

            <div className="rounded-xl border border-amber-300/20 bg-amber-400/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <CircleHelp className="h-5 w-5 text-amber-300" />
                <h3 className="font-semibold">Why Chronicle changes it</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Keeping the raw attribution would reward paladins for replacing or
                &quot;sniping&quot; another paladin&apos;s Judgement of Light debuff to claim
                the resulting healing.
              </p>
            </div>
          </div>
        </section>
      )}

      {priestSelected && (
        <section
          id="priest-details"
          aria-labelledby="priest-details-heading"
          className="overflow-hidden rounded-2xl border border-white/20 bg-[radial-gradient(circle_at_100%_0%,rgba(255,255,255,0.1),transparent_38%)] shadow-xl shadow-black/10"
        >
          <div className="flex items-center gap-4 border-b border-border/70 bg-card/70 p-5 sm:p-6">
            <img
              src="/c/icons/class_priest.png"
              alt="Priest class icon"
              className="h-14 w-14 rounded-lg border border-white/20 object-cover shadow-md"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Class details
              </p>
              <h2 id="priest-details-heading" className="text-2xl font-bold" style={{ color: PRIEST_COLOR }}>
                Priest
              </h2>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
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

            <section className="rounded-xl border border-violet-300/20 bg-violet-400/5 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Eye className="h-5 w-5 text-violet-300" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/80">
                    Class utility
                  </p>
                  <h3 className="text-lg font-semibold">Mind Control</h3>
                </div>
              </div>
              <p className="leading-relaxed text-muted-foreground">
                Chronicle records when Mind Control gives a priest temporary control of a
                unit and when that control ends. The relationship is cleared when the aura
                fades, the controlled unit dies, or the known duration expires. This lets
                Chronicle distinguish a mind-controlled enemy from an ordinary hostile unit
                while the effect is active.
              </p>
            </section>
          </div>
        </section>
      )}
    </div>
  )
}
