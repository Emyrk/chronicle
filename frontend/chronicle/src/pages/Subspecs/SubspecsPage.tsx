import { ArrowLeft, Check, GitBranch, Info, Shield, Tags } from "lucide-react"
import { Link } from "react-router-dom"
import { useSiteConfig } from "@/api/queries"
import { specializationIconUrl } from "@/config/specializationIcon"
import { subspecRulesForFlavor } from "./subspecs"

export function SubspecsPage() {
  const { data: siteConfig, isLoading } = useSiteConfig()
  const rules = subspecRulesForFlavor(siteConfig?.dataset_flavor ?? [])

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
          Subspecs divide one specialization into more precise ranking and parse cohorts when
          talent choices represent meaningfully different roles.
        </p>
      </div>

      <section className="mb-8 grid gap-4 md:grid-cols-3" aria-label="How subspecs work">
        <div className="rounded-xl border bg-card p-4">
          <Tags className="mb-3 h-5 w-5 text-sky-300" />
          <h2 className="mb-1 font-semibold">Dataset-aware</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Rules are enabled by the current tenant&apos;s resolved dataset flavor. Talent positions
            are read from that dataset rather than assumed globally.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <GitBranch className="mb-3 h-5 w-5 text-amber-300" />
          <h2 className="mb-1 font-semibold">Snapshot-specific</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Chronicle uses the talent snapshot recorded for each encounter, so a mid-raid respec
            can place later encounters in a different cohort.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <Shield className="mb-3 h-5 w-5 text-emerald-300" />
          <h2 className="mb-1 font-semibold">Cohort separation</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Leaderboards and spec-mode parses compare a subspec only with records from that same
            class, specialization, and subspec.
          </p>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Loading subspec rules for this server…
        </div>
      ) : rules.length === 0 ? (
        <section className="rounded-2xl border border-dashed bg-card/50 p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">No subspec rules are active for this server</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Chronicle currently uses the standard class and specialization cohorts for this
                tenant&apos;s dataset flavors.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-6">
          {rules.map((rule) => (
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
                  <h2 className="text-2xl font-bold">
                    {rule.spec}: {rule.subspecs.map((subspec) => subspec.name).join(" & ")}
                  </h2>
                </div>
              </div>

              <div className="space-y-6 p-5 sm:p-6">
                <div>
                  <h3 className="mb-3 text-lg font-semibold">Detection rule</h3>
                  <p className="mb-4 leading-relaxed text-muted-foreground">
                    A Feral Druid is classified as <strong className="text-foreground">Bear</strong>{" "}
                    only when the encounter&apos;s talent snapshot has at least one point in all three
                    required talents:
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {rule.detection.map((talent) => (
                      <div
                        key={talent}
                        className="flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-400/5 px-3 py-2.5 text-sm font-semibold"
                      >
                        <Check className="h-4 w-4 text-emerald-300" />
                        {talent}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {rule.subspecs.map((subspec) => {
                    const bear = subspec.name === "Bear"
                    return (
                      <div
                        key={subspec.name}
                        className={`rounded-xl border p-4 ${
                          bear
                            ? "border-emerald-300/20 bg-emerald-400/5"
                            : "border-orange-300/20 bg-orange-400/5"
                        }`}
                      >
                        <p
                          className={`mb-1 text-xs font-bold uppercase tracking-[0.14em] ${
                            bear ? "text-emerald-300/80" : "text-orange-300/80"
                          }`}
                        >
                          {subspec.name}
                        </p>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {subspec.description}
                        </p>
                      </div>
                    )
                  })}
                </div>

                <div className="rounded-xl border border-sky-300/20 bg-sky-400/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Info className="h-5 w-5 text-sky-300" />
                    <h3 className="font-semibold">Default behavior</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    If any required Bear talent is missing—or talent metadata cannot identify all
                    three markers—the build uses the <strong className="text-foreground">{rule.fallback}</strong>{" "}
                    subspec. Chronicle always produces one of these two Feral cohorts on the
                    Nightmare of Ursol flavor.
                  </p>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
