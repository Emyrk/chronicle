import { ArrowRight, Blocks, Box, Cpu, Database, Github, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"

const flow = [
  { label: "GitHub", detail: "manifest + bundles", icon: Github },
  { label: "Resolve", detail: "commit SHA", icon: ShieldCheck },
  { label: "Mount", detail: "ShadowRoot", icon: Box },
  { label: "Process", detail: "plugin worker", icon: Cpu },
  { label: "Render", detail: "host snapshots", icon: Blocks },
]

const contract = [
  ["Manifest", "Panels, streams, entry, worker, CSS."],
  ["Host", "mount → update → destroy."],
  ["Data", "Cached streams + batched game data."],
  ["State", "Selection, Replay, theme, size, options."],
]

export function CustomPanelsPage() {
  return (
    <main className="container mx-auto max-w-4xl px-4 py-10">
      <Link to="/tools" className="text-sm text-muted-foreground hover:text-foreground">
        ← Tools
      </Link>

      <div className="mt-6 border-l-2 border-amber-500 pl-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-500">Technical overview</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Custom panels</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Trusted GitHub code, pinned to a commit, running inside Chronicle.
        </p>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Flow</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">
          {flow.map((step, index) => (
            <div key={step.label} className="contents">
              <div className="rounded-md border bg-card p-3">
                <step.icon className="mb-3 h-4 w-4 text-amber-500" />
                <p className="font-semibold">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              </div>
              {index < flow.length - 1 && <ArrowRight className="mx-auto hidden h-4 w-4 text-muted-foreground md:block" />}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
        {contract.map(([title, detail]) => (
          <div key={title} className="bg-card p-4">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 grid gap-6 border-y py-6 sm:grid-cols-3">
        <div>
          <ShieldCheck className="mb-2 h-4 w-4 text-amber-500" />
          <h2 className="font-semibold">Trust</h2>
          <p className="mt-1 text-sm text-muted-foreground">Opt-in. Public repositories. Immutable artifacts.</p>
        </div>
        <div>
          <Cpu className="mb-2 h-4 w-4 text-amber-500" />
          <h2 className="font-semibold">Isolation</h2>
          <p className="mt-1 text-sm text-muted-foreground">Shadow DOM. One host-managed worker.</p>
        </div>
        <div>
          <Database className="mb-2 h-4 w-4 text-amber-500" />
          <h2 className="font-semibold">Cost</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nothing loads until a custom panel mounts.</p>
        </div>
      </section>

      <section className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link to="/account/custom-panels" className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-black hover:bg-amber-400">
          Manage panels
        </Link>
        <a
          href="https://github.com/Emyrk/chronicle-panel"
          target="_blank"
          rel="noreferrer"
          className="rounded-md border px-4 py-2 font-semibold hover:bg-accent"
        >
          Example + authoring guide ↗
        </a>
      </section>
    </main>
  )
}
