import { useState, type FormEvent, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { AtSign, LogIn, Puzzle, Sparkles, Tag, TriangleAlert } from "lucide-react"
import { claimAuthor, suggestAuthor, urlNameInput } from "./api"
import { button, errorMessage } from "./addonUi"

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"

// Each step has its own color, so the path reads at a glance: name (blue), build (violet), release (emerald).
const STEPS: { icon: ReactNode; title: string; text: string; tone: string }[] = [
  { icon: <AtSign className="size-4" />, title: "Claim your author name", tone: "border-sky-400/50 bg-sky-400/15 text-sky-300",
    text: "It is the first part of your addon links, and how other authors invite you to their addons." },
  { icon: <Sparkles className="size-4" />, title: "Build in the Addon Workshop", tone: "border-violet-400/50 bg-violet-400/15 text-violet-300",
    text: "Write a sandboxed Lua panel with the assistant's help, and try it on real raid logs as you go." },
  { icon: <Tag className="size-4" />, title: "Tag a release", tone: "border-emerald-400/50 bg-emerald-400/15 text-emerald-300",
    text: "Save your work to main while it is in progress. Tag a release when it is ready, and everyone can add it to their panels." },
]

/** The first thing someone without an author name sees on /addons: what addons are, and the one step that unlocks them. */
export function AddonWelcome({ signedIn, onClaimed }: { signedIn: boolean; onClaimed: (name: string) => void }) {
  return <section aria-label="Get started" className="relative grid gap-8 overflow-hidden rounded-xl border border-accent/40 bg-card p-6 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:p-8">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_55%),radial-gradient(ellipse_at_bottom_right,color-mix(in_oklch,var(--accent)_20%,transparent),transparent_55%)]" />
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-violet-400 to-emerald-400" />
    <div className="relative">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-amber-200"><Puzzle className="size-3.5" /> Addon Workshop</span>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">Welcome! Make your <span className="bg-gradient-to-r from-sky-300 via-violet-300 to-emerald-300 bg-clip-text text-transparent">first addon</span></h2>
      <p className="mt-2 text-sm text-muted-foreground">Addons are your own panels and guides for Chronicle, written in Lua. Getting started takes three steps.</p>
      <ol className="mt-6">
        {STEPS.map((step, index) => <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
          {index < STEPS.length - 1 && <span aria-hidden="true" className="absolute left-4 top-9 bottom-1 w-px -translate-x-1/2 bg-gradient-to-b from-border to-transparent" />}
          <span className={`relative flex size-8 shrink-0 items-center justify-center rounded-full border ${step.tone} ${index === 0 ? "ring-4 ring-sky-400/15" : ""}`}>{step.icon}</span>
          <div><h3 className="text-sm font-semibold">{index + 1}. {step.title}</h3><p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p></div>
        </li>)}
      </ol>
    </div>
    {signedIn ? <ClaimAuthorForm onClaimed={onClaimed} /> :
      <div className="relative flex flex-col justify-center gap-3 rounded-lg border border-sky-400/30 bg-background/70 p-5 text-sm shadow-lg shadow-black/20 backdrop-blur">
        <p className="font-medium">Sign in to get started.</p>
        <p className="text-muted-foreground">Anyone can add released addons to their raid panels. Making one needs an account.</p>
        <Link to="/login?from=/addons" className={`${primaryButton} w-fit`}><LogIn className="size-4" /> Sign in</Link>
      </div>}
  </section>
}

/** Pre-filled with the caller's username. Claiming asks once more, because the name cannot change later. */
function ClaimAuthorForm({ onClaimed }: { onClaimed: (name: string) => void }) {
  const suggestion = useQuery({ queryKey: ["addon-author-suggestion"], queryFn: suggestAuthor, staleTime: Infinity })
  const [typed, setTyped] = useState<string | null>(null)
  const name = typed ?? suggestion.data ?? ""
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const valid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && name.length >= 2

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    if (!confirming) { setConfirming(true); setError(""); return }
    setBusy(true); setError("")
    try { onClaimed(await claimAuthor(name)) } catch (e) { setError(errorMessage(e)); setConfirming(false) } finally { setBusy(false) }
  }

  return <form onSubmit={submit} className="relative h-fit space-y-3 rounded-lg border border-sky-400/30 bg-background/70 p-5 shadow-lg shadow-black/20 backdrop-blur">
    <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-sky-400/15 text-sky-300"><AtSign className="size-3.5" /></span> Step 1: your author name</div>
    <label className="block text-sm font-medium">Author name
      <input className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono disabled:opacity-60" value={name} disabled={confirming || busy}
        onChange={event => setTyped(urlNameInput(event.target.value))} placeholder={suggestion.isPending ? "Loading…" : "your-name"} minLength={2} maxLength={32} required /></label>
    <p className="break-all rounded-md bg-muted/40 px-2 py-1.5 font-mono text-xs text-muted-foreground">/addons/<span className="font-semibold text-sky-300">{name || "your-name"}</span>/my-addon</p>
    {suggestion.data && typed === null && !confirming && <p className="text-xs text-muted-foreground">Suggested from your username. You can change it before you claim it.</p>}
    {confirming ? <div role="alert" className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <span>Claim <strong className="font-mono">{name}</strong> for good? Author names cannot be changed later, because your addon links use them.</span></p>
      <div className="flex flex-wrap gap-2">
        <button className={primaryButton} disabled={busy} type="submit">{busy ? "Claiming…" : `Yes, claim “${name}”`}</button>
        <button className={button} disabled={busy} type="button" onClick={() => setConfirming(false)}>Change it</button>
      </div>
    </div> : <button className={`${primaryButton} w-full`} disabled={!valid} type="submit">Claim name</button>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </form>
}
