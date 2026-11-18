import { useRef, useState, type FormEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { getDeveloperApp } from "./developerAppApi"
import { KeyRound, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ExplorerOAuthSession } from "./explorerOAuth"

type Props = {
  connected: boolean
  onConnect: (session: ExplorerOAuthSession | null) => void
  sessionRef: { current: ExplorerOAuthSession | null }
}

export function ExplorerAuthentication({ connected, onConnect, sessionRef }: Props) {
  const { session: userSession, isAuthenticated } = useAuth()
  const { data: app } = useQuery({
    queryKey: ["developer-app", userSession?.user_id ?? ""],
    queryFn: getDeveloperApp,
    enabled: isAuthenticated && !connected,
    retry: false,
  })
  const [clientID, setClientID] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const secretRef = useRef<HTMLInputElement>(null)

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const fields = new FormData(event.currentTarget)
    const session = new ExplorerOAuthSession()
    sessionRef.current = session
    setPending(true)
    setError(null)
    try {
      const exchange = session.connect(String(fields.get("client_id")).trim(), String(fields.get("client_secret")))
      if (secretRef.current) secretRef.current.value = ""
      fields.delete("client_secret")
      await exchange
      if (sessionRef.current === session) onConnect(session)
    } catch {
      session.disconnect()
      if (sessionRef.current === session) {
        sessionRef.current = null
        setPending(false)
        setError("Could not authenticate your app. Check the client ID and secret, then try again.")
      }
    } finally {
      if (sessionRef.current === session) setPending(false)
    }
  }

  return (
    <section aria-label="Explorer authentication" className="mt-6 rounded-lg border border-cyan-300/20 bg-slate-950/65 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-cyan-300"><KeyRound className="size-4" />{connected ? "Authenticated as your app" : "Authenticate as your app"}</h2>
        {(connected || pending) && <Button size="sm" variant="outline" onClick={() => {
          sessionRef.current?.disconnect()
          sessionRef.current = null
          setPending(false)
          setError(null)
          onConnect(null)
        }}>Disconnect</Button>}
      </div>
      <p className="mt-3 text-xs leading-6 text-slate-400">{connected ? "Explorer requests and quota checks use your app. Tokens stay in memory and are cleared when you disconnect or leave this page." : "Test your own app here. Your secret goes only to Chronicle's token endpoint and is cleared after submission. Tokens are kept in memory, never browser storage."}</p>
      {!connected && <form onSubmit={(event) => void connect(event)} autoComplete="off" className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="explorer-client-id" className="text-xs text-slate-300">Client ID</label><Input id="explorer-client-id" name="client_id" value={clientID ?? app?.client_id ?? ""} onChange={(event) => setClientID(event.target.value)} required disabled={pending} autoComplete="off" className="mt-1 border-white/15 bg-slate-900" placeholder="chronicle-app-…" /></div>
        <div><label htmlFor="explorer-client-secret" className="text-xs text-slate-300">Client secret</label><Input ref={secretRef} id="explorer-client-secret" name="client_secret" type="password" required disabled={pending} autoComplete="off" className="mt-1 border-white/15 bg-slate-900" /></div>
        <div className="sm:col-span-2"><Button type="submit" disabled={pending} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">{pending && <LoaderCircle className="size-4 animate-spin" />}{pending ? "Authenticating…" : "Authenticate"}</Button></div>
      </form>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
      <p className="mt-3 text-xs leading-5 text-slate-500">For your own testing only. Never embed a client secret in a public frontend. Copied curl commands use a token placeholder, not your credentials.</p>
    </section>
  )
}
