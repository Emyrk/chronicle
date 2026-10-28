import { useState, type FormEvent, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { AtSign, LogIn, Sparkles, Tag, TriangleAlert } from "lucide-react"
import { claimAuthor, suggestAuthor, urlNameInput } from "./api"
import { button, card, errorMessage } from "./addonUi"

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"

const STEPS: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <AtSign className="size-4" />, title: "Claim your author name", text: "It is the first part of your addon links, and how other authors invite you to their addons." },
  { icon: <Sparkles className="size-4" />, title: "Build in the Addon Workshop", text: "Write a sandboxed Lua panel with the assistant's help, and try it on real raid logs as you go." },
  { icon: <Tag className="size-4" />, title: "Tag a release", text: "Save your work to main while it is in progress. Tag a release when it is ready, and everyone can add it to their panels." },
]

/** The first thing someone without an author name sees on /addons: what addons are, and the one step that unlocks them. */
export function AddonWelcome({ signedIn, onClaimed }: { signedIn: boolean; onClaimed: (name: string) => void }) {
  return <section aria-label="Get started" className={`${card} grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:p-8`}>
    <div>
      <h2 className="text-xl font-semibold tracking-tight">Welcome! Make your first addon</h2>
      <p className="mt-2 text-sm text-muted-foreground">Addons are your own panels and guides for Chronicle, written in Lua. Getting started takes three steps.</p>
      <ol className="mt-6 space-y-5">
        {STEPS.map((step, index) => <li key={step.title} className="flex gap-3">
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border ${index === 0 ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{step.icon}</span>
          <div><h3 className="text-sm font-semibold">{index + 1}. {step.title}</h3><p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p></div>
        </li>)}
      </ol>
    </div>
    {signedIn ? <ClaimAuthorForm onClaimed={onClaimed} /> :
      <div className="flex flex-col justify-center gap-3 rounded-lg border border-dashed p-5 text-sm">
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

  return <form onSubmit={submit} className="space-y-3 rounded-lg border bg-background/60 p-5">
    <div className="flex items-center gap-2 text-sm font-semibold"><AtSign className="size-4" /> Step 1: your author name</div>
    <label className="block text-sm font-medium">Author name
      <input className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono disabled:opacity-60" value={name} disabled={confirming || busy}
        onChange={event => setTyped(urlNameInput(event.target.value))} placeholder={suggestion.isPending ? "Loading…" : "your-name"} minLength={2} maxLength={32} required /></label>
    <p className="break-all font-mono text-xs text-muted-foreground">/addons/<span className="text-foreground">{name || "your-name"}</span>/my-addon</p>
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
