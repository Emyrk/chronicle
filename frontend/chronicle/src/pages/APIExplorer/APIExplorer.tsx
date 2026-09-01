import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Activity, Braces, Check, ChevronDown, Clipboard, Clock3, ExternalLink, LoaderCircle, Play, RefreshCw, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  buildRequestURL,
  endpointGroupsFromDocument,
  endpointsFromDocument,
  parameterKey,
  rateLimitStatusFromHeaders,
  type APIEndpoint,
  type OpenAPIDocument,
  type RateLimitStatus,
} from "./apiExplorerLogic"

const SPEC_URL = "/api/external/v1/openapi.json"

const RATE_LIMIT_BURST = 20

const methodStyles: Record<APIEndpoint["method"], string> = {
  get: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  post: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  put: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  patch: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  delete: "border-rose-400/30 bg-rose-400/10 text-rose-300",
}

type APIResponse = {
  status: number
  statusText: string
  duration: number
  body: unknown
}

async function fetchDocument(): Promise<OpenAPIDocument> {
  const response = await fetch(SPEC_URL)
  if (!response.ok) throw new Error(`OpenAPI request failed with ${response.status}`)
  return response.json() as Promise<OpenAPIDocument>
}

type RateLimitCheck = RateLimitStatus & {
  checkedAt: Date
}

async function fetchRateLimitStatus(server: string): Promise<RateLimitCheck> {
  const response = await fetch(`${server}/health`, { cache: "no-store" })
  if (!response.ok) throw new Error(`Health request failed with ${response.status}`)
  return { ...rateLimitStatusFromHeaders(response.headers), checkedAt: new Date() }
}

function RateLimitStatusCard({ server }: { server: string }) {
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["external-api", "rate-limit", server],
    queryFn: () => fetchRateLimitStatus(server),
    enabled: false,
  })

  const availablePercent = data ? Math.min((data.remaining / RATE_LIMIT_BURST) * 100, 100) : 0

  return (
    <div className="mt-10 rounded-lg border border-cyan-300/15 bg-slate-950/65 shadow-lg shadow-black/10 backdrop-blur-sm">
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(12rem,0.8fr)_minmax(20rem,1.5fr)_auto] md:items-center md:gap-7 sm:p-6">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300">
            <Activity className="h-3.5 w-3.5" />
            Your rate limit
            {data && <span className="ml-auto h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" aria-label="API online" />}
          </div>

          {data ? (
            <div className="mt-3">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <span className="text-3xl font-black tracking-tight text-white">{data.remaining}</span>
                  <span className="ml-1.5 font-mono text-xs text-slate-500">/ {RATE_LIMIT_BURST}</span>
                </div>
                <span className="pb-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">available now</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-300 transition-[width] duration-500"
                  style={{ width: `${availablePercent}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-[10px] text-slate-600">
                Checked {data.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
            </div>
          ) : (
            <p className={`mt-3 text-sm ${error ? "text-rose-300" : "text-slate-500"}`}>
              {error instanceof Error ? error.message : "Check your current allowance."}
            </p>
          )}
        </div>

        <div className="border-white/10 md:border-l md:pl-7">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
            <Clock3 className="h-3.5 w-3.5 text-cyan-300" />
            Continuous refill
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            The per-IP bucket holds {RATE_LIMIT_BURST} requests and refills one request each second, an average of {data?.limit ?? 60} per minute.
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Every response includes <code className="text-slate-400">RateLimit-Limit</code> and <code className="text-slate-400">RateLimit-Remaining</code>. A <code className="text-slate-400">429</code> response also includes <code className="text-slate-400">Retry-After</code>. This health check reports the allowance without consuming a request.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="w-full border-white/10 bg-white/[0.03] text-slate-200 hover:bg-cyan-300/10 hover:text-cyan-200 md:w-auto"
        >
          {isFetching ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          {isFetching ? "Checking" : data ? "Refresh status" : "Check status"}
        </Button>
      </div>
    </div>
  )
}

function EndpointCard({ endpoint, server }: { endpoint: APIEndpoint; server: string }) {
  const parameters = endpoint.operation.parameters ?? []
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(parameters.map((parameter) => [parameterKey(parameter), String(parameter.example ?? "")])),
  )
  const [response, setResponse] = useState<APIResponse | null>(null)
  const [requestURL, setRequestURL] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [copied, setCopied] = useState(false)

  const missingRequired = parameters.some(
    (parameter) => parameter.required && !(values[parameterKey(parameter)] ?? "").trim(),
  )

  const runRequest = async () => {
    const url = buildRequestURL(server, endpoint.path, parameters, values)
    setRequestURL(url)
    setIsRunning(true)
    setResponse(null)
    const started = performance.now()

    try {
      const result = await fetch(url, { method: endpoint.method.toUpperCase() })
      const contentType = result.headers.get("content-type") ?? ""
      const body = contentType.includes("application/json") ? await result.json() : await result.text()
      setResponse({
        status: result.status,
        statusText: result.statusText,
        duration: Math.round(performance.now() - started),
        body,
      })
    } catch (error) {
      setResponse({
        status: 0,
        statusText: "Request failed",
        duration: Math.round(performance.now() - started),
        body: { error: error instanceof Error ? error.message : "Unknown error" },
      })
    } finally {
      setIsRunning(false)
    }
  }

  const copyCurl = async () => {
    const url = buildRequestURL(server, endpoint.path, parameters, values)
    await navigator.clipboard.writeText(`curl -X ${endpoint.method.toUpperCase()} '${window.location.origin}${url}'`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 shadow-lg shadow-black/10">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] sm:px-5"
      >
        <span className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider ${methodStyles[endpoint.method]}`}>
          {endpoint.method}
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-slate-100">{endpoint.path}</code>
        <span className="hidden max-w-[40%] truncate text-sm text-slate-400 md:block">{endpoint.operation.summary}</span>
        {parameters.length > 0 && (
          <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-600 sm:block">
            {parameters.length} param{parameters.length === 1 ? "" : "s"}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
      </button>

      {isExpanded && (
        <div className="border-t border-white/10">
          <div className="px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold text-white">{endpoint.operation.summary}</h2>
            {endpoint.operation.description && (
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-400">{endpoint.operation.description}</p>
            )}
          </div>

          <div className="grid border-t border-white/10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="border-b border-white/10 p-4 sm:p-5 lg:border-b-0 lg:border-r">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300">Request</p>

              {parameters.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {parameters.map((parameter) => {
                    const key = parameterKey(parameter)
                    return (
                      <label key={key} className="block space-y-1.5">
                        <span className="flex items-center gap-2 text-xs font-medium text-slate-200">
                          {parameter.name}
                          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{parameter.in}</span>
                          {parameter.required && <span className="text-rose-400">required</span>}
                        </span>
                        <Input
                          value={values[key] ?? ""}
                          onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                          placeholder={parameter.description ?? `${parameter.schema.type} value`}
                          title={parameter.description}
                          className="h-9 border-white/10 bg-black/20 font-mono text-sm text-slate-100"
                        />
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No parameters required.</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={runRequest} disabled={isRunning || missingRequired} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                  {isRunning ? <LoaderCircle className="animate-spin" /> : <Play />}
                  {isRunning ? "Running" : "Try it"}
                </Button>
                <Button size="sm" variant="outline" onClick={copyCurl} disabled={missingRequired} className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white">
                  {copied ? <Check /> : <Clipboard />}
                  {copied ? "Copied" : "Copy cURL"}
                </Button>
              </div>
            </div>

            <div className="min-w-0 bg-black/20 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <Terminal className="h-3.5 w-3.5 text-cyan-300" />
                  Response
                </div>
                {response && (
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className={response.status >= 200 && response.status < 300 ? "text-emerald-300" : "text-rose-300"}>
                      {response.status || "ERR"} {response.statusText}
                    </span>
                    <span className="text-slate-500">{response.duration}ms</span>
                  </div>
                )}
              </div>

              <div className="styled-scrollbar max-h-72 min-h-28 overflow-auto rounded-md border border-white/10 bg-[#080d16] p-3">
                {response ? (
                  <pre className="text-xs leading-5 text-slate-300">{JSON.stringify(response.body, null, 2)}</pre>
                ) : (
                  <div className="flex min-h-20 items-center justify-center text-center text-xs text-slate-600">
                    Run this endpoint to inspect its response.
                  </div>
                )}
              </div>
              {requestURL && <p className="mt-2 break-all font-mono text-[10px] text-slate-600">{endpoint.method.toUpperCase()} {requestURL}</p>}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

export function APIExplorer() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["external-api", "openapi"],
    queryFn: fetchDocument,
  })

  const endpoints = data ? endpointsFromDocument(data) : []
  const endpointGroups = data ? endpointGroupsFromDocument(data) : []
  const server = data?.servers[0]?.url ?? "/api/external/v1"

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#090e17] text-slate-100">
      <header className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.14),transparent_35%),linear-gradient(115deg,transparent_55%,rgba(59,130,246,0.08))]" />
        <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
            <Braces className="h-4 w-4" />
            Developer interface
          </div>
          <div className="mt-5">
            <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">Chronicle External API</h1>
            <a href={SPEC_URL} className="mt-5 inline-flex items-center gap-2 font-mono text-xs text-slate-400 transition-colors hover:text-cyan-300">
              OpenAPI {data?.openapi ?? "3.1"}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <RateLimitStatusCard server={server} />
          {data && (
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-5 font-mono text-xs text-slate-500">
              <span><strong className="text-slate-200">{endpoints.length}</strong> documented endpoint{endpoints.length === 1 ? "" : "s"}</span>
              <span>Base <strong className="text-slate-200">{server}</strong></span>
              <span>Version <strong className="text-slate-200">{data.info.version}</strong></span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        {isLoading && (
          <div className="flex items-center justify-center gap-3 py-24 text-slate-500">
            <LoaderCircle className="h-5 w-5 animate-spin text-cyan-300" />
            Loading API contract…
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-6 text-rose-200">
            Unable to load the API contract: {error instanceof Error ? error.message : "Unknown error"}
          </div>
        )}
        <div className="space-y-12">
          {endpointGroups.map((group) => (
            <section key={group.name} aria-labelledby={`api-group-${group.name.replaceAll(" ", "-").toLowerCase()}`}>
              <div className="mb-5 border-b border-white/10 pb-4">
                <h2
                  id={`api-group-${group.name.replaceAll(" ", "-").toLowerCase()}`}
                  className="text-xl font-bold tracking-tight text-white sm:text-2xl"
                >
                  {group.name}
                </h2>
                {group.description && <p className="mt-1 text-sm text-slate-500">{group.description}</p>}
              </div>
              <div className="space-y-4">
                {group.endpoints.map((endpoint) => (
                  <EndpointCard key={`${endpoint.method}:${endpoint.path}`} endpoint={endpoint} server={server} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
