import { Fragment, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, Bot, CornerDownRight, FileText, Search, User, Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  estimateTokens, prettyJSON, promptSections, systemPrompt, type DebugRun, type SnapshotDiff,
} from "@/features/chat/debugViewerModel";
import type { DebugMessage, DebugSnapshotEvent } from "@/features/chat/protocol";

const number = new Intl.NumberFormat();

function bytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KiB`;
  return `${value} B`;
}

/** Wraps case-insensitive matches of query in <mark>. */
function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    parts.push(text.slice(from, at), <mark key={at} className="rounded-sm bg-yellow-400/40 text-inherit">{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

const countMatches = (text: string, query: string) => (query ? text.toLowerCase().split(query.toLowerCase()).length - 1 : 0);

function Code({ children, className }: { children: string; className?: string }) {
  return <pre className={cn("styled-scrollbar overflow-auto rounded-md bg-muted/50 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words", className)}>{children}</pre>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 pl-8 text-xs" />
    </div>
  );
}

export function EmptyTab({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground py-10 text-center text-sm">{children}</p>;
}

// ---------------------------------------------------------------------------------------------
// Conversation

const roleStyle: Record<string, { icon: ReactNode; label: string; className: string }> = {
  user: { icon: <User className="size-3.5" />, label: "User", className: "border-sky-500/30 bg-sky-500/5" },
  assistant: { icon: <Bot className="size-3.5" />, label: "Assistant", className: "border-violet-500/30 bg-violet-500/5" },
  tool: { icon: <Wrench className="size-3.5" />, label: "Tool result", className: "border-amber-500/30 bg-amber-500/5" },
};

function NewBadge() {
  return <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-500 uppercase">New</span>;
}

export function ConversationTab({ snapshot, diff, onOpenPrompt }: { snapshot: DebugSnapshotEvent; diff: SnapshotDiff; onOpenPrompt: () => void }) {
  const results = useMemo(() => {
    const map = new Map<string, DebugMessage>();
    for (const message of snapshot.messages) if (message.role === "tool" && message.toolCallId) map.set(message.toolCallId, message);
    return map;
  }, [snapshot]);
  const called = useMemo(() => new Set(snapshot.messages.flatMap((message) => message.toolCalls?.map((call) => call.id) ?? [])), [snapshot]);
  const prompt = systemPrompt(snapshot);
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {prompt && (
        <button type="button" onClick={onOpenPrompt} className="hover:bg-muted/40 flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs">
          <FileText className="text-muted-foreground size-3.5" />
          <span className="font-medium">System prompt</span>
          <span className="text-muted-foreground">~{number.format(estimateTokens(prompt))} tokens · {promptSections(prompt).length} sections</span>
          <span className="text-primary ml-auto">Open in Prompt tab</span>
        </button>
      )}
      {diff.historyRewritten && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          <AlertTriangle className="size-3.5" /> Earlier history differs from the previous snapshot (trimmed or rewritten).
        </p>
      )}
      {snapshot.messages.map((message, index) => {
        if (message.role === "system") return null;
        // Tool results render under the call that produced them.
        if (message.role === "tool" && message.toolCallId && called.has(message.toolCallId)) return null;
        const style = roleStyle[message.role] ?? roleStyle.tool;
        return (
          <article key={index} className={cn("overflow-hidden rounded-lg border", style.className)}>
            <header className="flex items-center gap-2 border-b border-inherit px-3 py-1.5 text-xs">
              {style.icon}
              <span className="font-semibold">{style.label}</span>
              {message.name && <span className="text-muted-foreground font-mono">{message.name}</span>}
              <span className="text-muted-foreground ml-auto font-mono text-[10px]">#{index}</span>
              {index >= diff.firstNewMessage && <NewBadge />}
            </header>
            {message.content ? (
              <div className="px-3 py-2.5 text-sm whitespace-pre-wrap break-words">{message.role === "tool" ? <Code>{prettyJSON(message.content)}</Code> : message.content}</div>
            ) : !message.toolCalls?.length && <p className="text-muted-foreground px-3 py-2.5 text-xs italic">(empty)</p>}
            {message.toolCalls?.map((call) => {
              const result = results.get(call.id);
              return (
                <div key={call.id} className="border-t border-inherit px-3 py-2.5">
                  <p className="mb-1.5 flex items-center gap-2 text-xs">
                    <Wrench className="size-3.5 text-amber-500" />
                    <span className="font-mono font-semibold">{call.name}</span>
                    <span className="text-muted-foreground font-mono text-[10px]">{call.id}</span>
                  </p>
                  <Code className="max-h-72">{prettyJSON(call.arguments) || "{}"}</Code>
                  <p className="text-muted-foreground mt-2 mb-1.5 flex items-center gap-1.5 text-[11px]">
                    <CornerDownRight className="size-3" /> {result ? "Result" : "No result in this snapshot yet"}
                  </p>
                  {result && <Code className="max-h-96">{prettyJSON(result.content) || "(empty)"}</Code>}
                </div>
              );
            })}
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Prompt

const markdownClasses = "prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted/60 prose-pre:text-foreground prose-table:text-xs prose-th:px-2 prose-td:px-2 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1";

export function PromptTab({ snapshot }: { snapshot: DebugSnapshotEvent }) {
  const prompt = systemPrompt(snapshot);
  const sections = useMemo(() => promptSections(prompt), [prompt]);
  const [query, setQuery] = useState("");
  const [rendered, setRendered] = useState(true);
  if (!prompt) return <EmptyTab>This snapshot has no system prompt.</EmptyTab>;
  const total = countMatches(prompt, query);
  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-64 shrink-0 flex-col gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Search prompt" />
        <p className="text-muted-foreground px-1 text-[11px]">
          {query ? `${total} match${total === 1 ? "" : "es"}` : `${number.format(prompt.length)} chars · ~${number.format(estimateTokens(prompt))} tokens`}
        </p>
        <nav className="styled-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          {sections.map((section) => {
            const matches = countMatches(section.text, query);
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className={cn("hover:bg-muted/60 flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-xs", query && !matches && "opacity-40")}
                style={{ paddingLeft: 8 + Math.max(0, section.level - 1) * 12 }}
              >
                <span className={cn("min-w-0 flex-1 truncate", section.level <= 1 && "font-medium")}>{section.title}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-[10px]">{query ? matches || "" : `~${number.format(section.tokens)}`}</span>
              </button>
            );
          })}
        </nav>
        <div className="bg-muted inline-flex rounded-md p-0.5 text-xs">
          {(["Rendered", "Raw"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRendered(mode === "Rendered")}
              disabled={Boolean(query)}
              title={query ? "Search results are shown as raw text" : undefined}
              className={cn("flex-1 rounded px-2 py-1", (mode === "Rendered") === (rendered && !query) ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            >
              {mode}
            </button>
          ))}
        </div>
      </aside>
      <div className="styled-scrollbar min-h-0 flex-1 overflow-y-auto rounded-lg border">
        {/* Searching shows only matching sections, as raw text with highlights. */}
        {sections.filter((section) => !query || countMatches(section.text, query) > 0).map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-2 border-b px-5 py-4 last:border-b-0">
            {rendered && !query ? (
              <div className={markdownClasses}><ReactMarkdown remarkPlugins={[remarkGfm]}>{section.text}</ReactMarkdown></div>
            ) : (
              <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">{highlight(section.text, query)}</pre>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Tools

interface SchemaProperty { type?: string | string[]; description?: string; enum?: unknown[] }

function SchemaTable({ schema }: { schema: unknown }) {
  const object = schema as { properties?: Record<string, SchemaProperty>; required?: string[] } | null;
  const properties = Object.entries(object?.properties ?? {});
  if (!properties.length) return <p className="text-muted-foreground text-xs">No parameters.</p>;
  const required = new Set(object?.required ?? []);
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-muted-foreground text-[10px] uppercase">
        <tr><th className="py-1 pr-3 font-medium">Parameter</th><th className="py-1 pr-3 font-medium">Type</th><th className="py-1 font-medium">Description</th></tr>
      </thead>
      <tbody>
        {properties.map(([name, property]) => (
          <tr key={name} className="border-t align-top">
            <td className="py-1.5 pr-3 font-mono">{name}{required.has(name) && <span className="text-destructive">*</span>}</td>
            <td className="text-muted-foreground py-1.5 pr-3 font-mono">{[property.type].flat().filter(Boolean).join(" | ") || "any"}{property.enum ? ` (${property.enum.map(String).join(", ")})` : ""}</td>
            <td className="py-1.5">{property.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ToolsTab({ snapshot }: { snapshot: DebugSnapshotEvent }) {
  const [query, setQuery] = useState("");
  const calls = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of snapshot.messages) for (const call of message.toolCalls ?? []) counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
    return counts;
  }, [snapshot]);
  const tools = snapshot.tools.filter((tool) => !query || `${tool.name} ${tool.description}`.toLowerCase().includes(query.toLowerCase()));
  if (!snapshot.tools.length) return <EmptyTab>No tools were offered to the model.</EmptyTab>;
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <SearchBox value={query} onChange={setQuery} placeholder="Filter tools" />
      {tools.map((tool) => (
        <details key={tool.name} className="group rounded-lg border" open={tools.length === 1}>
          <summary className="hover:bg-muted/40 flex cursor-pointer list-none items-center gap-2 px-3 py-2">
            <Wrench className="size-3.5 text-amber-500" />
            <span className="font-mono text-sm font-semibold">{tool.name}</span>
            {calls.get(tool.name) ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-500">called {calls.get(tool.name)}×</span> : null}
            <span className="text-muted-foreground ml-auto min-w-0 truncate text-xs">{tool.description.split("\n")[0]}</span>
          </summary>
          <div className="space-y-3 border-t px-3 py-3">
            <p className="text-sm whitespace-pre-wrap">{tool.description}</p>
            <SchemaTable schema={tool.parameters} />
            <details>
              <summary className="text-muted-foreground cursor-pointer text-[11px]">JSON schema</summary>
              <Code className="mt-2 max-h-80">{JSON.stringify(tool.parameters, null, 2)}</Code>
            </details>
          </div>
        </details>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Skills

export function SkillsTab({ snapshot }: { snapshot: DebugSnapshotEvent }) {
  if (!snapshot.skills.length) return <EmptyTab>No skills were applied to this request.</EmptyTab>;
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {snapshot.skills.map((skill) => (
        <article key={`${skill.id}-${skill.version ?? "current"}`} className="rounded-lg border p-3">
          <header className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-semibold">{skill.name}</h3>
            <span className="text-muted-foreground font-mono text-[11px]">{skill.id}{skill.version ? ` · ${skill.version}` : ""}{skill.source ? ` · ${skill.source}` : ""}</span>
          </header>
          {skill.tools?.length ? <p className="text-muted-foreground mt-1 text-xs">Tools: <span className="font-mono">{skill.tools.join(", ")}</span></p> : null}
          {skill.promptContribution && <div className={cn(markdownClasses, "mt-3 rounded-md border p-3")}><ReactMarkdown remarkPlugins={[remarkGfm]}>{skill.promptContribution}</ReactMarkdown></div>}
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Client tools

export function ClientToolsTab({ run }: { run: DebugRun }) {
  const latest = run.snapshots.at(-1);
  const results = new Map(latest?.messages.filter((message) => message.role === "tool" && message.toolCallId).map((message) => [message.toolCallId, message.content]));
  if (!run.clientToolRequests.length) return <EmptyTab>This run made no browser-side tool calls.</EmptyTab>;
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {run.clientToolRequests.map((request) => {
        const result = results.get(request.toolCallId);
        return (
          <article key={request.toolCallId} className="overflow-hidden rounded-lg border">
            <header className="bg-muted/30 flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
              <Wrench className="size-3.5 text-amber-500" />
              <span className="font-mono text-sm font-semibold">{request.toolName}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px]", request.effect === "read" ? "bg-sky-500/15 text-sky-500" : "bg-orange-500/15 text-orange-500")}>{request.effect.replace("_", " ")}</span>
              <span className="text-muted-foreground">confirm: {request.confirmation.replace("_", " ")}</span>
              <span className="text-muted-foreground ml-auto font-mono text-[10px]">{request.capability.id} v{request.capability.version}{request.capability.scopeType ? ` · ${request.capability.scopeType}` : ""}</span>
            </header>
            <div className="grid gap-3 p-3 md:grid-cols-2">
              <div>
                <p className="text-muted-foreground mb-1.5 text-[11px] font-medium">Arguments</p>
                <Code className="max-h-80">{JSON.stringify(request.arguments, null, 2)}</Code>
              </div>
              <div>
                <p className="text-muted-foreground mb-1.5 text-[11px] font-medium">Result</p>
                {result === undefined ? <p className="text-muted-foreground text-xs italic">No result recorded in the latest snapshot.</p> : <Code className="max-h-80">{prettyJSON(result) || "(empty)"}</Code>}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Run

function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
      {items.map(([label, value]) => (
        <Fragment key={label}><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 truncate font-mono">{value}</dd></Fragment>
      ))}
    </dl>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-lg border p-4"><h3 className="mb-3 text-xs font-semibold tracking-wide uppercase">{title}</h3>{children}</section>;
}

export function RunTab({ snapshot, diff, error }: { snapshot: DebugSnapshotEvent; diff: SnapshotDiff; error?: string }) {
  const limits = snapshot.limits;
  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
      {error && <p className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive lg:col-span-2"><AlertTriangle className="size-4" /> {error}</p>}
      <Card title="Request">
        <Facts items={[
          ["Assistant", snapshot.assistantId], ["Model", snapshot.model], ["Persistence", snapshot.persistence],
          ["Run", snapshot.runId], ["Iteration", `${snapshot.iteration} · ${snapshot.phase.replace(/_/g, " ")}`],
          ...(snapshot.contextType ? [["Context", `${snapshot.contextType}${snapshot.contextId ? ` · ${snapshot.contextId}` : ""}`] as [string, ReactNode]] : []),
        ]} />
      </Card>
      <Card title="Usage">
        <Facts items={[
          ["Prompt tokens", number.format(snapshot.usage.promptTokens)], ["Completion tokens", number.format(snapshot.usage.completionTokens)],
          ["Total tokens", number.format(snapshot.usage.totalTokens)],
          ["Cached tokens", number.format(snapshot.usage.cachedTokens ?? 0)], ["Reasoning tokens", number.format(snapshot.usage.reasoningTokens ?? 0)],
          ["Cost so far", snapshot.usage.costUsd === undefined ? "Not reported" : `$${snapshot.usage.costUsd.toFixed(6)}`],
          ["Messages", snapshot.messages.length], ["Tools offered", snapshot.tools.length],
        ]} />
      </Card>
      <Card title="Changes since previous snapshot">
        <Facts items={[
          ["Token delta", `${diff.tokenDelta >= 0 ? "+" : ""}${number.format(diff.tokenDelta)}`],
          ["New messages", diff.addedMessages.length],
          ["History", diff.historyRewritten ? "trimmed or rewritten" : "appended only"],
          ["System prompt", diff.systemPromptChanged ? "changed" : "unchanged"],
          ["Tools added", diff.toolsAdded.join(", ") || "none"],
          ["Tools removed", diff.toolsRemoved.join(", ") || "none"],
        ]} />
        {diff.addedMessages.length > 0 && (
          <ul className="mt-3 space-y-1 border-t pt-3 text-xs">
            {diff.addedMessages.map((message, index) => (
              <li key={index} className="flex gap-2">
                <span className="w-16 shrink-0 font-semibold">{message.role}</span>
                <span className="text-muted-foreground min-w-0 truncate">{message.content || message.toolCalls?.map((call) => call.name).join(", ") || "(empty)"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Limits">
        <Facts items={[
          ["History", `${limits.maxHistoryMessages} messages · ${bytes(limits.maxHistoryBytes)}`], ["Iterations", limits.maxIterations],
          ["Tool calls", limits.maxToolCalls], ["Tool arguments", bytes(limits.maxToolArguments)], ["Tool output", bytes(limits.maxToolOutput)],
          ["Assistant text", bytes(limits.maxAssistantText)],
        ]} />
      </Card>
    </div>
  );
}
