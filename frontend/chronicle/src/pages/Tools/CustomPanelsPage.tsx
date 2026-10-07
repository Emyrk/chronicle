import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

const facts = [
  ["Trust model", "Trusted code, runs in the page. Not a sandbox."],
  ["Default", "Off, per account"],
  ["Source", "Public GitHub repo at a full commit SHA"],
  ["Host API", "v1"],
]

const pipeline: { step: string; title: string; detail: ReactNode }[] = [
  { step: "01 · Author", title: "Publish", detail: <><Code>chronicle-panel.json</Code> + bundles in a public repo</> },
  { step: "02 · Chronicle server", title: "Resolve", detail: "Ref → 40-char SHA. Fetch + validate manifest only" },
  { step: "03 · You", title: "Approve", detail: "Review SHA, digests, panels, streams" },
  { step: "04 · Browser", title: "Verify", detail: "Download from raw GitHub. Match size + SHA-256" },
  { step: "05 · Chronicle page", title: "Run", detail: "Blob import → mount in Shadow Root" },
]

const userFaq = [
  { q: "Is a custom panel sandboxed?", a: "No. The entry module runs in Chronicle's page with the same authority as first-party code: it can read page state, use your session, and make requests. The Shadow Root isolates styles only. Install only from authors you trust." },
  { q: "What exactly am I approving?", a: "One repository at one immutable commit SHA. Chronicle validates the manifest, artifact paths, sizes and SHA-256 digests, but does not audit the JavaScript." },
  { q: "What do I need to install one?", a: "A signed-in Chronicle account and the global “Enable trusted custom JavaScript panels” switch. No GitHub account or token. Only public repositories work. Up to 32 installations per account." },
  { q: "Are installations synced across devices?", a: "Yes. Installations and the master switch are stored on your account. Accounts installing the same commit share one release record." },
  { q: "Does opening a shared link install a plugin?", a: "Never. Shared URLs and saved layouts keep the panel reference. If you don't have the plugin, you see a placeholder with the repository, panel ID and a button to the install flow." },
  { q: "How do updates work?", a: "Check for update re-resolves the ref to a new commit and asks you to confirm when hashes change. Layouts reference repository + panel ID, not a version, so they keep working." },
  { q: "What if a panel breaks?", a: "Only that panel slot fails. You get Retry, Disable plugin, Open Settings and Switch to Empty. Add ?safe=1 to the URL to block all custom code for that page load." },
  { q: "Will plugins slow Chronicle down?", a: "Not when unused. Installed-but-unselected plugins only contribute selector labels. An active panel uses extra memory for its stream copies and its own CPU, and badly written UI code can affect responsiveness." },
]

const authorFaq = [
  { q: "What does my repository need?", a: "A public GitHub repo with chronicle-panel.json at the root and committed build output. The manifest declares plugin id (github:owner/repo), 1–16 panels, their streams, and artifacts as { path, sha256, size }." },
  { q: "What artifacts can I ship?", a: "A required entry bundle, plus optional worker and CSS. Entry and worker must each be one self-contained ESM file with no runtime relative imports. Limits: manifest 64 KiB, entry 2 MiB, worker 4 MiB, styles 512 KiB." },
  { q: "What does the entry module export?", a: "A default export { apiVersion: 1, mount(request) }. mount returns an object with optional update(snapshot) and destroy(). The host checks apiVersion before calling mount." },
  { q: "How do I get event data?", a: "Call api.events.getStream(type) for a stream your panel declared. Each call returns a new copy of Chronicle's decompressed binary stream, so request once and transfer the buffer to your worker." },
  { q: "How do workers work?", a: "If the manifest declares a worker, api.workers.create() starts one module worker per mounted panel; a second call throws. The host terminates it on cleanup. There is no main-thread fallback." },
  { q: "How do I decode streams?", a: "Install @emyrk/chronicle-panel-sdk and import its versioned v1 host types, chronicle-event-stream-v1 decoder, and generated protobuf schemas. Bundle the package into your worker so the final artifact remains self-contained." },
  { q: "How should I style and render?", a: "Render into the provided Shadow Root using the documented theme CSS variables. Use root.host.ownerDocument, not window.document, so popped-out panels work." },
  { q: "What else can the host API do?", a: "Set the panel option (opaque string, 2 KiB max), select encounters, toggle players, look up item metadata (512 IDs per call), and observe api.lifecycle.signal for teardown." },
]

function Code({ children }: { children: ReactNode }) {
  return <span className="font-mono text-foreground">{children}</span>
}

function Node({ title, detail, className }: { title: ReactNode; detail?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2.5", className)}>
      <span className="text-[13.5px] font-semibold leading-snug">{title}</span>
      {detail && <span className="text-xs leading-snug text-muted-foreground">{detail}</span>}
    </div>
  )
}

function ArrowRight() {
  return (
    <div className="flex items-center">
      <div className="h-px flex-1 bg-muted-foreground/55" />
      <div className="h-0 w-0 border-y-4 border-l-[7px] border-y-transparent border-l-muted-foreground" />
    </div>
  )
}

function ArrowLeft() {
  return (
    <div className="flex items-center">
      <div className="h-0 w-0 border-y-4 border-r-[7px] border-y-transparent border-r-muted-foreground" />
      <div className="h-px flex-1 bg-muted-foreground/55" />
    </div>
  )
}

function ArrowDown() {
  return (
    <div className="flex h-[22px] flex-col items-center">
      <div className="w-px flex-1 bg-muted-foreground/55" />
      <div className="h-0 w-0 border-x-4 border-t-[7px] border-x-transparent border-t-muted-foreground" />
    </div>
  )
}

function SectionTitle({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {aside && <span className="text-[13px] text-muted-foreground">{aside}</span>}
    </div>
  )
}

function Faq({ title, audience, items }: { title: string; audience: string; items: { q: string; a: string }[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <span className="text-[13px] text-muted-foreground">{audience}</span>
      </div>
      <div className="flex flex-col border-t">
        {items.map((item) => (
          <details key={item.q} className="group border-b">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[14.5px] font-medium [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 text-pretty">{item.q}</span>
              <span className="flex-none text-lg font-light leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="pb-4 pr-8 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">{item.a}</div>
          </details>
        ))}
      </div>
    </div>
  )
}

function DataPill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={cn("justify-self-center whitespace-nowrap rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground", className)}>
      {children}
    </div>
  )
}

function DataArrow({ className, label, left }: { className: string; label: string; left?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1 px-1.5", className)}>
      <span className="text-center font-mono text-xs">{label}</span>
      {left ? <ArrowLeft /> : <ArrowRight />}
    </div>
  )
}

export function CustomPanelsPage() {
  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-16 px-5 pb-20 pt-10 sm:px-8 lg:px-16">
      <header className="grid items-end gap-x-16 gap-y-8 md:grid-cols-2">
        <div className="flex flex-col gap-3.5">
          <Link to="/tools" className="font-mono text-xs text-muted-foreground hover:text-foreground">
            ← tools / custom-panels
          </Link>
          <h1 className="text-balance text-4xl font-semibold leading-none tracking-tight md:text-5xl">Custom panel plugins</h1>
          <p className="max-w-[560px] text-pretty leading-relaxed text-muted-foreground">
            A plugin is a public GitHub repository, pinned to one commit, that provides fully custom panel views. Panels render any
            browser UI, read Chronicle's cached event streams, and can process them in their own Web Worker.
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-sm">
            <Link to="/account/custom-panels" className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90">
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
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 border-t pt-4 text-[13px]">
          {facts.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className={cn(term === "Host API" && "font-mono")}>{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="flex flex-col gap-6">
        <SectionTitle title="From repository to running panel" />
        <div className="styled-scrollbar overflow-x-auto pb-1">
          <div className="grid min-w-[720px] grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)] gap-y-3.5">
            {pipeline.map((p, i) => {
              const last = i === pipeline.length - 1
              return (
                <div key={p.title} className="contents">
                  <div className="flex flex-col gap-2">
                    <span className={cn("font-mono text-[11px]", last ? "text-primary" : "text-muted-foreground")}>{p.step}</span>
                    <Node title={p.title} detail={p.detail} className={cn(last && "border-primary")} />
                  </div>
                  {!last && (
                    <div className="pt-[42px]">
                      <ArrowRight />
                    </div>
                  )}
                </div>
              )
            })}
            <div className="col-[1/8] h-2.5 rounded-b-md border border-t-0 border-muted-foreground/55" />
            <div className="col-[9/10] h-2.5 rounded-b-md border border-t-0 border-primary" />
            <div className="col-[1/8] text-center text-xs text-muted-foreground">Metadata only. No plugin code executes.</div>
            <div className="col-[9/10] text-center text-xs text-primary">Plugin code runs</div>
          </div>
        </div>
      </section>

      <section className="grid items-start gap-x-16 gap-y-12 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <SectionTitle title="Two paths, one resolver" />
          <div className="flex flex-col items-center">
            <Node
              className="min-w-[280px] items-center text-center"
              title="EventsPanel resolver"
              detail={<>Checks for the <Code>custom:</Code> prefix</>}
            />
            <div className="h-3.5 w-px bg-muted-foreground/55" />
            <div className="mx-[25%] h-3.5 self-stretch border border-b-0 border-muted-foreground/55" />
            <div className="grid grid-cols-2 gap-4 self-stretch">
              <div className="flex flex-col">
                <div className="flex flex-col items-center">
                  <span className="py-0.5 font-mono text-[11px] text-muted-foreground">built-in</span>
                  <ArrowDown />
                </div>
                <Node title="BuiltinEventsPanel" className="opacity-70" />
                <ArrowDown />
                <Node title="usePanelAggregation" className="opacity-70" />
                <ArrowDown />
                <Node title="workerPool + registry" className="opacity-70" />
                <span className="pt-2 text-center text-xs text-muted-foreground">Unchanged</span>
              </div>
              <div className="flex flex-col">
                <div className="flex flex-col items-center">
                  <span className="py-0.5 font-mono text-[11px] text-primary">custom:…</span>
                  <ArrowDown />
                </div>
                <Node title="Lazy runtime chunk" />
                <ArrowDown />
                <Node title="Download + verify" />
                <ArrowDown />
                <Node title="Shadow Root mount" className="border-primary" />
                <span className="pt-2 text-center text-xs text-muted-foreground">Loaded only when selected</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <SectionTitle title="Lifecycle" />
          <div className="flex flex-col">
            <Node
              title={<span className="font-mono font-normal text-primary">mount(request)</span>}
              detail={<>Once per panel. Gets <Code>root</Code>, <Code>api</Code>, <Code>snapshot</Code></>}
            />
            <ArrowDown />
            <Node
              title={
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-mono font-normal text-primary">update(snapshot)</span>
                  <span className="whitespace-nowrap font-mono text-[11px] font-normal text-muted-foreground">↻ repeats</span>
                </span>
              }
              detail="On every snapshot change: encounter, players, enemies, Sync, theme, option, size, popup. Coalesced per frame."
            />
            <ArrowDown />
            <Node
              title={<span className="font-mono font-normal text-primary">destroy()</span>}
              detail="Swap, unmount, instance change, disable, or recovery"
            />
            <ArrowDown />
            <Node
              className="border-dashed border-muted-foreground bg-transparent"
              title="Host cleanup, always"
              detail="Abort signal · terminate worker · clear root · revoke Blob URLs. Runs even if destroy throws."
            />
          </div>
        </div>
      </section>

      <p className="max-w-[820px] text-pretty text-[13.5px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Zero cost when unused.</span> With no custom panel installed or selected there
        are no plugin requests, imports, workers, stream copies, observers or timers. Installed-but-unselected plugins only contribute
        labels to the panel selector.
      </p>

      <section className="flex flex-col gap-6">
        <SectionTitle title="Data path" aside="One stream request, one transfer" />
        <div className="styled-scrollbar overflow-x-auto pb-1">
          <div className="relative min-w-[760px]">
            <div className="absolute bottom-0 left-[16.666%] top-14 border-l border-dashed" />
            <div className="absolute bottom-0 left-1/2 top-14 border-l border-dashed" />
            <div className="absolute bottom-0 left-[83.333%] top-14 border-l border-dashed" />
            <div className="relative grid grid-cols-6 items-end gap-y-[18px]">
              <Node className="col-[1/3] min-w-[180px] justify-self-center px-4 text-center" title="Chronicle host" detail="Stream cache" />
              <Node className="col-[3/5] min-w-[180px] justify-self-center px-4 text-center" title="Plugin view" detail="Main thread · Shadow Root" />
              <Node className="col-[5/7] min-w-[180px] justify-self-center px-4 text-center" title="Plugin worker" detail="api.workers.create()" />
              <DataArrow className="col-[2/4]" label='getStream("spell_go")' left />
              <DataPill className="col-[1/3]">Cache hit or deduped fetch</DataPill>
              <DataArrow className="col-[2/4]" label="owned ArrayBuffer copy" />
              <DataArrow className="col-[4/6]" label="postMessage(buf, [buf])" />
              <DataPill className="col-[5/7]">Decode with SDK v1</DataPill>
              <DataArrow className="col-[4/6]" label="results" left />
              <DataPill className="col-[3/5]">Render</DataPill>
            </div>
          </div>
        </div>
        <p className="max-w-[820px] text-pretty text-[13px] leading-relaxed text-muted-foreground">
          Only streams the panel declared in its manifest can be requested. Every call returns a new copy, so Chronicle's cached buffer
          is never exposed or detached.
        </p>
      </section>

      <section className="flex flex-col gap-2.5 rounded-lg bg-destructive/12 px-7 py-6">
        <div className="font-mono text-xs text-muted-foreground">Shown on every install</div>
        <p className="max-w-[860px] text-pretty text-[17px] font-medium leading-normal">
          Custom panels execute arbitrary JavaScript with access to the Chronicle page, your authenticated session, and combat-log data.
          Only install panels from authors you trust.
        </p>
      </section>

      <section className="grid gap-x-16 gap-y-12 lg:grid-cols-2">
        <Faq title="Installing panels" audience="For Chronicle users" items={userFaq} />
        <Faq title="Building panels" audience="For plugin authors" items={authorFaq} />
      </section>
    </main>
  )
}
