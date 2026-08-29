import { useState } from "react"
import { ArrowLeft, ChevronRight, HeartPulse, Sparkles } from "lucide-react"
import { Link } from "react-router-dom"
import { specializationIconUrl } from "@/config/specializationIcon"

const PALADIN_COLOR = "var(--color-class-paladin)"

export function ClassDetailsPage() {
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const paladinSelected = selectedClass === "PALADIN"

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
                In 2.4.3 and 3.3.5a combat logs, Judgement of Light healing can be
                reported as healing done by the paladin who applied the debuff. Chronicle
                instead credits each heal to the player whose attack triggered it, which
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
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300/80">
                  Chronicle attribution
                </p>
                <p className="text-sm text-muted-foreground">
                  The attacking player who triggered and received the heal gets the credit.
                </p>
              </div>
            </div>

            <div className="flex gap-3 rounded-xl bg-muted/40 p-4">
              <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-pink-300" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Chronicle identifies this effect by spell ID <strong className="text-foreground">20267</strong>,
                so the behavior is independent of the spell name or client language. The
                healing amount is unchanged; only the credited source is corrected.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
