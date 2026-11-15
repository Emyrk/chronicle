import { useState, type FormEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ArrowLeft, ArrowUpRight, Check, Clipboard, KeyRound, LoaderCircle, RotateCcw, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/useAuth"
import { createDeveloperApp, deleteDeveloperApp, getDeveloperApp, rotateDeveloperSecret, type DeveloperApp } from "./developerAppApi"

const appQueryKey = (userID: string) => ["developer-app", userID] as const

export function DeveloperAppPage() {
  const { session, isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const userID = session?.user_id ?? ""
  const { data: app, isLoading, error: loadError, refetch } = useQuery({
    queryKey: appQueryKey(userID),
    queryFn: getDeveloperApp,
    enabled: isAuthenticated,
    retry: false,
  })
  const [name, setName] = useState("")
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState<"create" | "rotate" | "delete" | null>(null)
  const [confirm, setConfirm] = useState<"rotate" | "delete" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const updateApp = (next: DeveloperApp | null) => queryClient.setQueryData(appQueryKey(userID), next)

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || pending) return
    setPending("create")
    setActionError(null)
    try {
      const created = await createDeveloperApp(name.trim())
      const { client_secret, ...metadata } = created
      updateApp(metadata)
      setSecret(client_secret)
      setCopied(false)
      setName("")
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not create the app.")
    } finally {
      setPending(null)
    }
  }

  const rotate = async () => {
    if (pending) return
    setPending("rotate")
    setActionError(null)
    try {
      const rotated = await rotateDeveloperSecret()
      const { client_secret, ...metadata } = rotated
      updateApp(metadata)
      setSecret(client_secret)
      setCopied(false)
      setConfirm(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not rotate the secret.")
    } finally {
      setPending(null)
    }
  }

  const remove = async () => {
    if (pending) return
    setPending("delete")
    setActionError(null)
    try {
      await deleteDeveloperApp()
      updateApp(null)
      setSecret(null)
      setConfirm(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete the app.")
    } finally {
      setPending(null)
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setActionError("Clipboard access failed. Copy the value manually.")
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#090e17] text-slate-100">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_75%_0%,rgba(34,211,238,0.13),transparent_40%)]">
        <div className="mx-auto max-w-5xl px-5 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-12">
          <Link to="/developers/api" className="inline-flex items-center gap-2 font-mono text-xs text-slate-400 transition-colors hover:text-cyan-300"><ArrowLeft className="size-4" /> API explorer</Link>
          <div className="mt-9 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-cyan-300"><KeyRound className="size-4" /> Developer access / 01</div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-6xl">Your developer app</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">One app per account. Give your integration read-only access to Chronicle&apos;s external API without sharing your user session.</p>
        </div>
      </div>

      <main className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.8fr)] lg:py-14">
        <div className="min-w-0 space-y-6">
          {authLoading || (isAuthenticated && isLoading) ? (
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-8 text-sm text-slate-400"><LoaderCircle className="size-5 animate-spin text-cyan-300" /> Loading your app…</div>
          ) : !isAuthenticated ? (
            <section className="rounded-lg border border-cyan-300/20 bg-slate-950/70 p-7 sm:p-9">
              <h2 className="text-2xl font-bold text-white">Sign in to get started</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">The API explorer stays public. You need a Chronicle account to create and manage an OAuth app.</p>
              <Button asChild className="mt-6 bg-cyan-300 text-slate-950 hover:bg-cyan-200"><Link to="/login?from=%2Fdevelopers%2Fapi%2Fapp">Sign in <ArrowUpRight className="size-4" /></Link></Button>
            </section>
          ) : loadError ? (
            <section className="rounded-lg border border-rose-400/20 bg-rose-400/5 p-7 text-sm text-rose-200" role="alert">
              <p>Could not load your developer app. Please try again.</p>
              <Button variant="outline" className="mt-4" onClick={() => void refetch()}>Retry</Button>
            </section>
          ) : (
            <>
              {actionError && <p role="alert" className="rounded-md border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{actionError}</p>}
              {secret && (
                <section className="rounded-lg border border-amber-300/35 bg-amber-300/[0.07] p-6 sm:p-8" aria-label="New client secret">
                  <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300">One-time reveal</div>
                  <h2 className="mt-2 text-xl font-bold text-white">Save your client secret now</h2>
                  <p className="mt-2 text-sm leading-6 text-amber-100/75">This secret will not be shown again. Store it securely before leaving this page. Rotating it revokes all existing tokens.</p>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <code className="styled-scrollbar min-w-0 flex-1 overflow-x-auto rounded-md border border-amber-300/20 bg-black/40 px-4 py-3 font-mono text-sm text-amber-100" data-testid="client-secret">{secret}</code>
                    <Button variant="outline" className="border-amber-300/30 text-amber-100 hover:bg-amber-300/10" onClick={() => void copy(secret)}>{copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}{copied ? "Copied" : "Copy secret"}</Button>
                  </div>
                  <Button variant="ghost" className="mt-3 text-amber-200 hover:text-white" onClick={() => setSecret(null)}>I saved the secret</Button>
                </section>
              )}
              {!app ? (
                <section className="rounded-lg border border-white/10 bg-slate-950/70 p-7 sm:p-9">
                  <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-300">Application / new</div>
                  <h2 className="mt-3 text-2xl font-bold text-white">Create an app</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Name the service or tool that will call the external API. You can only create one app per account.</p>
                  <form onSubmit={(event) => void create(event)} className="mt-7 space-y-4">
                    <label htmlFor="developer-app-name" className="block text-sm font-medium text-slate-200">App name</label>
                    <Input id="developer-app-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Raid analytics bot" maxLength={100} required className="border-white/15 bg-slate-900 text-white" />
                    <Button type="submit" disabled={!name.trim() || !!pending} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">{pending === "create" ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}{pending === "create" ? "Creating…" : "Create app"}</Button>
                  </form>
                </section>
              ) : (
                <section className="rounded-lg border border-white/10 bg-slate-950/70 p-7 sm:p-9">
                  <div className="flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-300">Application / active</span><span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">Read only</span></div>
                  <h2 className="mt-4 break-words text-2xl font-bold text-white">{app.name}</h2>
                  <div className="mt-8 border-t border-white/10 pt-6">
                    <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">Client ID</div>
                    <code className="styled-scrollbar mt-2 block overflow-x-auto rounded-md border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs text-slate-200">{app.client_id}</code>
                    <div className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">Scope</div>
                    <code className="mt-2 block text-sm text-cyan-300">external:read</code>
                  </div>
                  <div className="mt-8 border-t border-white/10 pt-6">
                    <h3 className="text-sm font-semibold text-slate-200">Credentials</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">Your secret is only shown when created or rotated. Rotation revokes existing access and refresh tokens.</p>
                    {confirm === "rotate" ? (
                      <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/5 p-4"><p className="text-sm text-amber-100">Rotate the secret and revoke all current tokens?</p><div className="mt-3 flex gap-2"><Button disabled={!!pending} onClick={() => void rotate()}>{pending === "rotate" ? "Rotating…" : "Rotate secret"}</Button><Button variant="ghost" disabled={!!pending} onClick={() => setConfirm(null)}>Cancel</Button></div></div>
                    ) : (
                      <Button variant="outline" disabled={!!pending || !!secret} className="mt-4 border-white/15 text-slate-200" onClick={() => setConfirm("rotate")}><RotateCcw className="size-4" />Rotate secret</Button>
                    )}
                  </div>
                  <div className="mt-8 border-t border-rose-400/15 pt-6">
                    {confirm === "delete" ? (
                      <div className="rounded-md border border-rose-400/25 bg-rose-400/5 p-4"><p className="text-sm text-rose-200">Delete this app and revoke all its tokens? This cannot be undone.</p><div className="mt-3 flex gap-2"><Button variant="destructive" disabled={!!pending} onClick={() => void remove()}>{pending === "delete" ? "Deleting…" : "Delete app"}</Button><Button variant="ghost" disabled={!!pending} onClick={() => setConfirm(null)}>Cancel</Button></div></div>
                    ) : (
                      <Button variant="ghost" disabled={!!pending || !!secret} className="text-rose-300 hover:bg-rose-400/10 hover:text-rose-200" onClick={() => setConfirm("delete")}><Trash2 className="size-4" />Delete app</Button>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-6">
            <ShieldCheck className="size-6 text-cyan-300" />
            <h2 className="mt-4 text-lg font-bold text-white">How access works</h2>
            <ol className="mt-4 space-y-4 text-sm leading-6 text-slate-400">
              <li><span className="font-mono text-cyan-300">01 /</span> Create an app and save its secret once.</li>
              <li><span className="font-mono text-cyan-300">02 /</span> Exchange the client ID and secret at <code className="text-slate-200">/oauth/token</code> for a one-hour access token.</li>
              <li><span className="font-mono text-cyan-300">03 /</span> Use the refresh token to renew access without resending your secret. Keep each new refresh token.</li>
            </ol>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/60 p-6 text-sm leading-6 text-slate-400">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Quota</div>
            <p className="mt-3">Authenticated requests share a limit of 60 per minute per app, regardless of client IP. Event requests cost one tenth of a standard request.</p>
            <Link to="/developers/api" className="mt-4 inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">Browse the API <ArrowUpRight className="size-4" /></Link>
          </div>
        </aside>
      </main>
    </div>
  )
}
