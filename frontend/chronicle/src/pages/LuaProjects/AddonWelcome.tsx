import { useState, type FormEvent, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { AtSign, Check, Globe, LogIn, Sparkles, Tag, TriangleAlert } from "lucide-react"
import { claimAuthor, MIN_AUTHOR_NAME, suggestAuthor, urlNameInput, validAuthorName } from "./api"
import { button, card, errorMessage, primaryButton, welcomeBox } from "./addonUi"

// Each step has its own color: name (blue), build (violet), release (emerald).
const STEPS: { icon: ReactNode; title: string; text: string; tone: string; ring: string }[] = [
  { icon: <AtSign className="size-4" />, title: "Claim your author name", tone: "border-sky-400/50 bg-sky-400/15 text-sky-300", ring: "ring-sky-400/15",
    text: "It is the first part of your addon links, and how other authors invite you to their addons." },
  { icon: <Sparkles className="size-4" />, title: "Build in the Addon Workshop", tone: "border-violet-400/50 bg-violet-400/15 text-violet-300", ring: "ring-violet-400/15",
    text: "Name your addon, and the Workshop opens. Write a sandboxed Lua panel with the assistant's help, and try it on real raid logs as you go." },
  { icon: <Tag className="size-4" />, title: "Tag a release", tone: "border-emerald-400/50 bg-emerald-400/15 text-emerald-300", ring: "ring-emerald-400/15",
    text: "Save your work to main while it is in progress. Tag a release when it is ready, and everyone can add it to their panels." },
]

/**
 * What a newcomer sees on /addons until their first addon exists: the three steps, with `step` the one to do now.
 * Done steps get a tick, later ones stay muted, and `children` is the form for the current step.
 */
export function AddonWelcome({ step, author, children }: { step: number; author?: string; children: ReactNode }) {
  return <section aria-label="Get started" className={`${card} grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:p-8`}>
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{step === 0 ? "Welcome! Make your first addon" : "Nice! Now make your first addon"}</h2>
      <p className="mt-2 text-sm text-muted-foreground">Addons are your own panels for Chronicle's raid view, written in Lua. Getting started takes three steps.</p>
      <ol className="mt-6">
        {STEPS.map((item, index) => {
          const done = index < step, current = index === step
          return <li key={item.title} aria-current={current ? "step" : undefined} className={`relative flex gap-3 pb-5 last:pb-0 ${done || current ? "" : "opacity-50"}`}>
            {index < STEPS.length - 1 && <span aria-hidden="true" className="absolute left-4 top-9 bottom-1 w-px -translate-x-1/2 bg-border" />}
            <span className={`relative flex size-8 shrink-0 items-center justify-center rounded-full border ${item.tone} ${current ? `ring-4 ${item.ring}` : ""}`}>{done ? <Check className="size-4" /> : item.icon}</span>
            <div><h3 className={`text-sm font-semibold ${done || current ? "" : "text-muted-foreground"}`}>{index + 1}. {item.title}{done && <span className="sr-only"> (done)</span>}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{done && index === 0 && author ? <>Claimed as <span className="font-mono text-foreground">{author}</span>.</> : item.text}</p></div>
          </li>
        })}
      </ol>
    </div>
    {children}
  </section>
}

export function SignInPrompt() {
  return <div className={`${welcomeBox} space-y-3 text-sm`}>
    <p className="font-medium">Sign in to get started.</p>
    <p className="text-muted-foreground">Anyone can add released addons to their raid panels. Making one needs an account.</p>
    <Link to="/login?from=/addons" className={`${primaryButton} w-fit`}><LogIn className="size-4" /> Sign in</Link>
  </div>
}

/** Pre-filled with the caller's username. Claiming asks once more, because the name cannot change later. */
export function ClaimAuthorForm({ onClaimed }: { onClaimed: (name: string) => void }) {
  const suggestion = useQuery({ queryKey: ["addon-author-suggestion"], queryFn: suggestAuthor, staleTime: Infinity })
  const [typed, setTyped] = useState<string | null>(null)
  const name = typed ?? suggestion.data ?? ""
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const valid = validAuthorName(name)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    if (!confirming) { setConfirming(true); setError(""); return }
    setBusy(true); setError("")
    try { onClaimed(await claimAuthor(name)) } catch (e) { setError(errorMessage(e)); setConfirming(false) } finally { setBusy(false) }
  }

  return <form onSubmit={submit} className={`${welcomeBox} space-y-3`}>
    <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-sky-400/15 text-sky-300"><AtSign className="size-3.5" /></span> Step 1: your author name</div>
    <label className="block text-sm font-medium">Author name
      <input className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono disabled:opacity-60" value={name} disabled={confirming || busy}
        onChange={event => setTyped(urlNameInput(event.target.value))} placeholder={suggestion.isPending ? "Loading…" : "your-name"} minLength={MIN_AUTHOR_NAME} maxLength={32} required /></label>
    <p className="break-all font-mono text-xs text-muted-foreground">/addons/<span className="text-foreground">{name || "your-name"}</span>/my-addon</p>
    {name && !valid && <p className="text-xs text-amber-300">Use at least {MIN_AUTHOR_NAME} characters: lowercase letters, numbers and single hyphens.</p>}
    {suggestion.data && typed === null && !confirming && <p className="text-xs text-muted-foreground">Suggested from your username. You can change it before you claim it.</p>}
    <p className="flex gap-2 rounded-md border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground"><Globe className="mt-0.5 size-3.5 shrink-0" />
      <span>Becoming an addon author makes this name public. Anyone can see it on your addons and in their links, so pick one you are happy to share.</span></p>
    {confirming ? <div role="alert" className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <span>Claim <strong className="font-mono">{name}</strong> for good? It will be public, and author names cannot be changed later, because your addon links use them.</span></p>
      <div className="flex flex-wrap gap-2">
        <button className={primaryButton} disabled={busy} type="submit">{busy ? "Claiming…" : `Yes, claim “${name}”`}</button>
        <button className={button} disabled={busy} type="button" onClick={() => setConfirming(false)}>Change it</button>
      </div>
    </div> : <button className={`${primaryButton} w-full`} disabled={!valid} type="submit">Claim name</button>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </form>
}
