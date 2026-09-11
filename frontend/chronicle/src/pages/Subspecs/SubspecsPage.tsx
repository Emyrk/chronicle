import { useState } from "react"
import { ArrowLeft, Check, ChevronRight, Info } from "lucide-react"
import { Link } from "react-router-dom"
import { useSiteConfig } from "@/api/queries"
import { specializationIconUrl } from "@/config/specializationIcon"
import { subspecRulesForFlavor } from "./subspecs"

export function SubspecsPage() {
  const { data: siteConfig, isLoading } = useSiteConfig()
  const rules = subspecRulesForFlavor(siteConfig?.dataset_flavor ?? [])
  const classes = [...new Set(rules.map((rule) => rule.className))]
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const selectedRules = rules.filter((rule) => rule.className === selectedClass)

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
          Ranking classification
        </p>
        <h1 className="mb-3 text-3xl font-bold">Subspecs</h1>
        <p className="text-muted-foreground">
          See how Chronicle divides specializations into more precise ranking and parse cohorts.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Loading subspec rules for this server…
        </div>
      ) : classes.length === 0 ? (
        <section className="rounded-2xl border border-dashed bg-card/50 p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">No subspec rules are active for this server</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Chronicle currently uses the standard class and specialization cohorts for this
                server.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="choose-class" className="mb-8">
            <h2
              id="choose-class"
              className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Choose a class
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {classes.map((className) => {
                const selected = selectedClass === className
                return (
                  <button
                    key={className}
                    type="button"
                    aria-expanded={selected}
                    aria-controls={`${className.toLowerCase()}-subspec-details`}
                    onClick={() => setSelectedClass(selected ? null : className)}
                    className={`group flex w-full max-w-sm cursor-pointer items-center gap-4 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70 ${
                      selected
                        ? "border-orange-300/50 bg-orange-300/10 shadow-lg shadow-orange-950/20"
                        : "bg-card hover:border-orange-300/30 hover:bg-orange-300/5"
                    }`}
                  >
                    <img
                      src={`/c/icons/class_${className.toLowerCase().replaceAll(" ", "")}.png`}
                      alt=""
                      aria-hidden="true"
                      className="h-16 w-16 rounded-lg border border-white/15 object-cover shadow-md transition-transform group-hover:scale-105"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Class
                      </span>
                      <span
                        className="block text-lg font-bold"
                        style={{ color: `var(--color-class-${className.toLowerCase().replaceAll(" ", "-")})` }}
                      >
                        {className}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {rules
                          .filter((rule) => rule.className === className)
                          .map((rule) => rule.spec)
                          .join(", ")}
                      </span>
                    </span>
                    <ChevronRight
                      className={`h-5 w-5 text-muted-foreground transition-transform ${selected ? "rotate-90 text-orange-200" : ""}`}
                    />
                  </button>
                )
              })}
            </div>
          </section>

          {selectedClass && (
            <div id={`${selectedClass.toLowerCase()}-subspec-details`} className="space-y-6">
              {selectedRules.map((rule) => (
                <section
                  key={`${rule.flavor}:${rule.className}:${rule.spec}`}
                  className="overflow-hidden rounded-2xl border border-orange-300/20 bg-[radial-gradient(circle_at_100%_0%,rgba(251,146,60,0.12),transparent_38%)] shadow-xl shadow-black/10"
                >
                  <div className="flex items-center gap-4 border-b border-border/70 bg-card/70 p-5 sm:p-6">
                    <img
                      src={specializationIconUrl(rule.className, rule.spec)}
                      alt={`${rule.spec} ${rule.className} specialization icon`}
                      className="h-14 w-14 rounded-lg border border-orange-200/20 object-cover shadow-md"
                    />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300/80">
                        {rule.className} specialization
                      </p>
                      <h2 className="text-2xl font-bold">{rule.spec}</h2>
                    </div>
                  </div>

                  <div className="space-y-6 p-5 sm:p-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {rule.subspecs.map((subspec) => {
                        const detected = subspec.name === rule.detectedSubspec
                        return (
                          <div
                            key={subspec.name}
                            className={`rounded-xl border p-4 ${
                              detected
                                ? "border-emerald-300/20 bg-emerald-400/5"
                                : "border-orange-300/20 bg-orange-400/5"
                            }`}
                          >
                            <p
                              className={`mb-1 text-xs font-bold uppercase tracking-[0.14em] ${
                                detected ? "text-emerald-300/80" : "text-orange-300/80"
                              }`}
                            >
                              {subspec.name}
                            </p>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {subspec.description}
                            </p>
                            {detected && (
                              <div className="mt-4 space-y-2">
                                {rule.detection.map((talent) => (
                                  <div key={talent} className="flex items-center gap-2 text-sm font-semibold">
                                    <Check className="h-4 w-4 text-emerald-300" />
                                    At least 1 point in {talent}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
