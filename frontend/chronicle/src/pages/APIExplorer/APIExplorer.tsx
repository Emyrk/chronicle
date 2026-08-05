import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Braces, Check, Clipboard, ExternalLink, LoaderCircle, Play, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  buildRequestURL,
  endpointsFromDocument,
  parameterKey,
  type APIEndpoint,
  type OpenAPIDocument,
} from "./apiExplorer"

const SPEC_URL = "/api/external/v1/openapi.json"

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

function EndpointCard({ endpoint, server }: { endpoint: APIEndpoint; server: string }) {
  const parameters = endpoint.operation.parameters ?? []
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(parameters.map((parameter) => [parameterKey(parameter), String(parameter.example ?? "")])),
  )
  const [response, setResponse] = useState<APIResponse | null>(null)
  const [requestURL, setRequestURL] = useState("")
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
    <article className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/10">
      <div className="border-b border-white/10 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-md border px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider ${methodStyles[endpoint.method]}`}>
            {endpoint.method}
          </span>
          <code className="break-all font-mono text-sm text-slate-100 sm:text-base">{endpoint.path}</code>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">{endpoint.operation.summary}</h2>
        {endpoint.operation.description && (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{endpoint.operation.description}</p>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-white/10 p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-300">Request builder</p>
              <p className="mt-1 text-sm text-slate-500">Fill parameters, then run against the live API.</p>
            </div>
          </div>

          {parameters.length > 0 ? (
            <div className="space-y-4">
              {parameters.map((parameter) => {
                const key = parameterKey(parameter)
                return (
                  <label key={key} className="block space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
                      {parameter.name}
                      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{parameter.in}</span>
                      {parameter.required && <span className="text-rose-400">required</span>}
                    </span>
                    <Input
                      value={values[key] ?? ""}
                      onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder={parameter.description ?? `${parameter.schema.type} value`}
                      className="border-white/10 bg-black/20 font-mono text-slate-100"
                    />
                    {parameter.description && <span className="block text-xs text-slate-500">{parameter.description}</span>}
                  </label>
                )
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-500">
              This endpoint has no parameters.
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={runRequest} disabled={isRunning || missingRequired} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              {isRunning ? <LoaderCircle className="animate-spin" /> : <Play />}
              {isRunning ? "Running" : "Try it"}
            </Button>
            <Button variant="outline" onClick={copyCurl} disabled={missingRequired} className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white">
              {copied ? <Check /> : <Clipboard />}
              {copied ? "Copied" : "Copy cURL"}
            </Button>
          </div>
        </div>

        <div className="min-w-0 bg-black/20 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <Terminal className="h-4 w-4 text-cyan-300" />
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

          <div className="styled-scrollbar min-h-48 overflow-auto rounded-lg border border-white/10 bg-[#080d16] p-4">
            {response ? (
              <pre className="text-xs leading-6 text-slate-300">{JSON.stringify(response.body, null, 2)}</pre>
            ) : (
              <div className="flex min-h-40 items-center justify-center text-center text-sm text-slate-600">
                Run this endpoint to inspect its live response payload.
              </div>
            )}
          </div>
          {requestURL && <p className="mt-3 break-all font-mono text-[11px] text-slate-600">{endpoint.method.toUpperCase()} {requestURL}</p>}
        </div>
      </div>
    </article>
  )
}

export function APIExplorer() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["external-api", "openapi"],
    queryFn: fetchDocument,
  })

  const endpoints = data ? endpointsFromDocument(data) : []
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
          <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">Chronicle External API</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
                Live documentation for public Chronicle integrations. Inspect the contract, provide parameters, and execute requests without leaving the page.
              </p>
            </div>
            <a href={SPEC_URL} className="inline-flex items-center gap-2 font-mono text-xs text-slate-400 transition-colors hover:text-cyan-300">
              OpenAPI {data?.openapi ?? "3.1"}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
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
        <div className="space-y-6">
          {endpoints.map((endpoint) => (
            <EndpointCard key={`${endpoint.method}:${endpoint.path}`} endpoint={endpoint} server={server} />
          ))}
        </div>
      </main>
    </div>
  )
}
