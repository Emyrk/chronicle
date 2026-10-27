import { useMemo, useState } from "react";
import { Braces, ChevronRight, Download, ExternalLink, FileText, Gauge, Puzzle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { serializeInferenceDebug } from "./debugExport";
import { openDebugViewer, useDebugBroadcast } from "./debugChannel";
import type { ClientToolRequestEvent, DebugSnapshotEvent } from "./protocol";

interface DebugInspectorProps {
  /** Channel the pop-out debug viewer listens on. */
  channelId: string;
  /** Chat title shown in the pop-out viewer. */
  title?: string;
  snapshots: readonly DebugSnapshotEvent[];
  clientToolRequests: readonly ClientToolRequestEvent[];
  error?: string;
}

function formattedJSON(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function downloadDebugSnapshots(
  snapshots: readonly DebugSnapshotEvent[],
  clientToolRequests: readonly ClientToolRequestEvent[],
  error?: string,
): void {
  const runId = snapshots.at(-1)?.runId ?? clientToolRequests.at(-1)?.runId ?? "run";
  const blob = new Blob([serializeInferenceDebug(snapshots, clientToolRequests, error)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `chronicle-inference-debug-${runId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function bytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KiB`;
  return `${value} B`;
}

function Snapshot({ snapshot, latest }: { snapshot: DebugSnapshotEvent; latest: boolean }) {
  return (
    <details open={latest} className="group rounded-lg border bg-background/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted/40">
        <span className="font-medium">Iteration {snapshot.iteration} · {snapshot.phase.replace("_", " ")}</span>
        <span className="text-muted-foreground truncate font-mono">{snapshot.model}</span>
      </summary>
      <div className="space-y-4 border-t p-3">
        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium"><FileText className="size-3.5" /> Provider messages</div>
          <div className="space-y-2">
            {snapshot.messages.map((message, index) => (
              <div key={`${index}-${message.role}-${message.toolCallId ?? "message"}`} className="overflow-hidden rounded border bg-muted/20">
                <div className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide">{message.role}</span>
                  {message.name && <span className="text-muted-foreground font-mono text-[10px]">{message.name}</span>}
                </div>
                <pre className="styled-scrollbar max-h-52 overflow-auto p-2.5 font-mono text-[11px] whitespace-pre-wrap break-words">{message.content || "(empty)"}</pre>
                {message.toolCalls?.map((call) => (
                  <div key={call.id} className="border-t px-2.5 py-2">
                    <p className="font-mono text-[10px] font-medium">{call.name} · {call.id}</p>
                    <pre className="text-muted-foreground mt-1 overflow-auto font-mono text-[10px] whitespace-pre-wrap">{call.arguments}</pre>
                  </div>
                ))}
                {message.toolCallId && <p className="text-muted-foreground border-t px-2.5 py-1.5 font-mono text-[10px]">toolCallId: {message.toolCallId}</p>}
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Wrench className="size-3.5" /> Tools ({snapshot.tools.length})</div>
          {snapshot.tools.length ? (
            <div className="space-y-2">
              {snapshot.tools.map((tool) => (
                <details key={tool.name} className="rounded border bg-muted/20">
                  <summary className="cursor-pointer px-2.5 py-2 font-mono text-[11px] font-medium">{tool.name}</summary>
                  <div className="border-t p-2.5">
                    <p className="text-muted-foreground text-[11px]">{tool.description}</p>
                    <pre className="styled-scrollbar mt-2 max-h-52 overflow-auto font-mono text-[10px] whitespace-pre-wrap">{formattedJSON(tool.parameters)}</pre>
                  </div>
                </details>
              ))}
            </div>
          ) : <p className="text-muted-foreground text-xs">No tools available.</p>}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Puzzle className="size-3.5" /> Skills ({snapshot.skills.length})</div>
          {snapshot.skills.length ? snapshot.skills.map((skill) => (
            <div key={`${skill.id}-${skill.version ?? "current"}`} className="rounded border bg-muted/20 p-2.5 text-xs">
              <p className="font-medium">{skill.name}</p>
              <p className="text-muted-foreground mt-1 font-mono text-[10px]">{skill.id}{skill.version ? ` · ${skill.version}` : ""}</p>
              {skill.promptContribution && <pre className="mt-2 font-mono text-[10px] whitespace-pre-wrap">{skill.promptContribution}</pre>}
            </div>
          )) : <p className="text-muted-foreground text-xs">No skills applied. Skill composition has not been implemented yet.</p>}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border bg-muted/20 p-2.5">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Gauge className="size-3.5" /> Limits</div>
            <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <dt>History</dt><dd>{snapshot.limits.maxHistoryMessages} messages</dd>
              <dt>History bytes</dt><dd>{bytes(snapshot.limits.maxHistoryBytes)}</dd>
              <dt>Iterations</dt><dd>{snapshot.limits.maxIterations}</dd>
              <dt>Tool calls</dt><dd>{snapshot.limits.maxToolCalls}</dd>
              <dt>Tool arguments</dt><dd>{bytes(snapshot.limits.maxToolArguments)}</dd>
              <dt>Tool output</dt><dd>{bytes(snapshot.limits.maxToolOutput)}</dd>
              <dt>Assistant text</dt><dd>{bytes(snapshot.limits.maxAssistantText)}</dd>
            </dl>
          </div>
          <div className="rounded border bg-muted/20 p-2.5">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Braces className="size-3.5" /> Run</div>
            <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <dt>Assistant</dt><dd>{snapshot.assistantId}</dd>
              <dt>Persistence</dt><dd>{snapshot.persistence}</dd>
              <dt>Prompt tokens</dt><dd>{snapshot.usage.promptTokens}</dd>
              <dt>Completion</dt><dd>{snapshot.usage.completionTokens}</dd>
              <dt>Total</dt><dd>{snapshot.usage.totalTokens}</dd>
              {snapshot.contextType && <><dt>Context</dt><dd>{snapshot.contextType}</dd></>}
              {snapshot.contextId && <><dt>Context ID</dt><dd className="truncate font-mono" title={snapshot.contextId}>{snapshot.contextId}</dd></>}
            </dl>
          </div>
        </section>
      </div>
    </details>
  );
}

export function DebugInspector({ channelId, title, snapshots, clientToolRequests, error }: DebugInspectorProps) {
  const [expanded, setExpanded] = useState(false);
  const bundle = useMemo(() => ({ snapshots: [...snapshots], clientToolRequests: [...clientToolRequests], ...(error ? { error } : {}) }), [snapshots, clientToolRequests, error]);
  useDebugBroadcast(channelId, bundle, title);
  const empty = snapshots.length === 0;
  return (
    <div className="bg-muted/10 border-b">
      <div className="flex items-center gap-2 px-4 py-1">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] disabled:pointer-events-none"
          onClick={() => setExpanded((value) => !value)}
          disabled={empty}
          aria-expanded={expanded}
          title="Server-generated provider requests. Credentials and headers are never included."
        >
          <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", expanded && !empty && "rotate-90")} />
          <span className="text-foreground font-medium">Prompt inspector</span>
          <span>· {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"}</span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={empty && clientToolRequests.length === 0}
          onClick={() => downloadDebugSnapshots(snapshots, clientToolRequests, error)}
          title="Download JSON"
          aria-label="Download JSON"
        >
          <Download className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => openDebugViewer(channelId)}
          title="Open the debug viewer in its own window"
          aria-label="Open debug viewer"
        >
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
      {expanded && !empty && (
        <div className="styled-scrollbar max-h-[42vh] space-y-2 overflow-y-auto px-4 pb-3">
          {snapshots.map((snapshot, index) => (
            <Snapshot key={`${snapshot.runId}-${snapshot.iteration}-${snapshot.phase}`} snapshot={snapshot} latest={index === snapshots.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
