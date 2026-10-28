import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bug, Download, Radio, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useDebugSubscription, type DebugLinkStatus } from "@/features/chat/debugChannel";
import { serializeInferenceDebug } from "@/features/chat/debugExport";
import {
  diffSnapshots, emptyDebugBundle, groupRuns, parseDebugBundle, snapshotKey,
} from "@/features/chat/debugViewerModel";
import type { DebugSnapshotEvent } from "@/features/chat/protocol";
import { ClientToolsTab, ConversationTab, EmptyTab, PromptTab, RunTab, SkillsTab, ToolsTab } from "./DebugViewerTabs";
import { formatCost } from "@/features/chat/usage";

const number = new Intl.NumberFormat();

const statusStyle: Record<DebugLinkStatus, { label: string; className: string }> = {
  waiting: { label: "Waiting for chat", className: "bg-muted text-muted-foreground" },
  connected: { label: "Live", className: "bg-emerald-500/15 text-emerald-500" },
  disconnected: { label: "Chat closed", className: "bg-amber-500/15 text-amber-500" },
};

const phaseColor: Record<DebugSnapshotEvent["phase"], string> = {
  request: "bg-sky-500",
  response: "bg-violet-500",
  tool_results: "bg-amber-500",
  client_tool_request: "bg-orange-500",
};

function download(text: string, runId: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `chronicle-inference-debug-${runId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Full-window assistant debugger. Opened from a chat's Prompt inspector, it follows that chat live
 * over a BroadcastChannel and keeps every run it sees; it can also open a downloaded debug JSON.
 */
export default function AssistantDebugPage() {
  const [params] = useSearchParams();
  const channelId = params.get("channel");
  const { bundle, setBundle, title, status } = useDebugSubscription(channelId);
  const [fileName, setFileName] = useState<string>();
  const [importError, setImportError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tab, setTab] = useState("conversation");

  const runs = useMemo(() => groupRuns(bundle), [bundle]);
  const snapshots = bundle.snapshots;
  // With nothing pinned the viewer follows the newest snapshot as the chat streams.
  const pinned = selectedKey ? snapshots.findIndex((snapshot) => snapshotKey(snapshot) === selectedKey) : -1;
  const index = pinned >= 0 ? pinned : snapshots.length - 1;
  const snapshot = snapshots[index];
  const previous = index > 0 ? snapshots[index - 1] : undefined;
  const diff = useMemo(() => (snapshot ? diffSnapshots(previous, snapshot) : undefined), [previous, snapshot]);
  const run = runs.find((candidate) => candidate.runId === snapshot?.runId);
  const following = pinned < 0;

  useEffect(() => {
    document.title = `${title ? `${title} · ` : ""}Assistant debugger`;
  }, [title]);

  const importFile = async (file: File) => {
    try {
      setBundle(parseDebugBundle(await file.text()));
      setFileName(file.name);
      setSelectedKey(null);
      setImportError(undefined);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not read file");
    }
  };

  const live = Boolean(channelId);
  return (
    <div
      className="bg-background text-foreground flex h-screen flex-col"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void importFile(file);
      }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <Bug className="text-primary size-5" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{title ?? "Assistant"} · Debugger</h1>
          <p className="text-muted-foreground truncate font-mono text-[11px]">
            {snapshot ? `${snapshot.assistantId} · ${snapshot.model}` : "No snapshots yet"}
          </p>
        </div>
        {live && (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", statusStyle[status].className)}>
            <Radio className={cn("size-3", status === "connected" && "animate-pulse")} /> {statusStyle[status].label}
          </span>
        )}
        {fileName && <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-mono text-[11px]">{fileName}</span>}
        <div className="ml-auto flex items-center gap-1">
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = "";
          }} />
          <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}><Upload /> Import</Button>
          <Button variant="ghost" size="sm" disabled={!snapshots.length} onClick={() => download(serializeInferenceDebug(snapshots, bundle.clientToolRequests, bundle.error), snapshots.at(-1)?.runId ?? "run")}>
            <Download /> Download
          </Button>
          <Button variant="ghost" size="sm" disabled={!snapshots.length} onClick={() => { setBundle(emptyDebugBundle()); setSelectedKey(null); setFileName(undefined); }}>
            <Trash2 /> Clear
          </Button>
        </div>
      </header>
      {importError && <p role="alert" className="border-b border-destructive/40 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">{importError}</p>}

      {!snapshot ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Bug className="text-muted-foreground size-10" />
          <p className="max-w-md text-sm">
            {live
              ? "Waiting for the chat. Send a message with Debug enabled and each model request will appear here."
              : "Open this window from a chat's Prompt inspector, or import a debug JSON file."}
          </p>
          <p className="text-muted-foreground text-xs">You can also drop a downloaded debug JSON anywhere on this page.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="bg-muted/10 flex w-72 shrink-0 flex-col border-r">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
              <span className="font-medium">{runs.length} run{runs.length === 1 ? "" : "s"} · {snapshots.length} snapshots</span>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                disabled={following}
                className={cn("rounded px-1.5 py-0.5", following ? "text-emerald-500" : "text-primary hover:bg-muted")}
              >
                {following ? "Following latest" : "Follow latest"}
              </button>
            </div>
            <nav className="styled-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {runs.map((candidate, runIndex) => (
                <section key={candidate.runId} className="mb-3">
                  <header className="text-muted-foreground flex items-baseline gap-2 px-2 pb-1 text-[11px]">
                    <span className="text-foreground font-semibold">Run {runIndex + 1}</span>
                    <span className="truncate font-mono" title={candidate.runId}>{candidate.runId.slice(0, 8)}</span>
                    <span className="ml-auto shrink-0">{number.format(candidate.totalTokens)} tok{candidate.costUsd !== undefined && ` · ${formatCost(candidate.costUsd)}`}</span>
                  </header>
                  {candidate.snapshots.map((item) => {
                    const key = snapshotKey(item);
                    const active = snapshot === item;
                    const calls = item.messages.at(-1)?.toolCalls?.map((call) => call.name) ?? [];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedKey(item === snapshots.at(-1) ? null : key)}
                        aria-current={active ? "true" : undefined}
                        className={cn("flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-xs", active ? "bg-primary/15 ring-primary/40 ring-1" : "hover:bg-muted/60")}
                      >
                        <span className="flex items-center gap-2">
                          <span className={cn("size-2 shrink-0 rounded-full", phaseColor[item.phase])} />
                          <span className="font-medium">#{item.iteration} {item.phase.replace(/_/g, " ")}</span>
                          <span className="text-muted-foreground ml-auto font-mono text-[10px]">{number.format(item.usage.totalTokens)}</span>
                        </span>
                        {calls.length > 0 && <span className="text-muted-foreground truncate pl-4 font-mono text-[10px]">→ {calls.join(", ")}</span>}
                      </button>
                    );
                  })}
                </section>
              ))}
              {bundle.error && <p className="mx-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">{bundle.error}</p>}
            </nav>
          </aside>

          <Tabs value={tab} onValueChange={setTab} className="min-w-0 flex-1 gap-0">
            <div className="border-b px-4 py-2">
              <TabsList>
                <TabsTrigger value="conversation">Conversation <Count value={snapshot.messages.length} /></TabsTrigger>
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="tools">Tools <Count value={snapshot.tools.length} /></TabsTrigger>
                <TabsTrigger value="skills">Skills <Count value={snapshot.skills.length} /></TabsTrigger>
                <TabsTrigger value="client-tools">Client tools <Count value={run?.clientToolRequests.length ?? 0} /></TabsTrigger>
                <TabsTrigger value="run">Run</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="conversation" className="styled-scrollbar min-h-0 overflow-y-auto p-4">
              {diff && <ConversationTab snapshot={snapshot} diff={diff} onOpenPrompt={() => setTab("prompt")} />}
            </TabsContent>
            <TabsContent value="prompt" className="min-h-0 p-4"><PromptTab snapshot={snapshot} /></TabsContent>
            <TabsContent value="tools" className="styled-scrollbar min-h-0 overflow-y-auto p-4"><ToolsTab snapshot={snapshot} /></TabsContent>
            <TabsContent value="skills" className="styled-scrollbar min-h-0 overflow-y-auto p-4"><SkillsTab snapshot={snapshot} /></TabsContent>
            <TabsContent value="client-tools" className="styled-scrollbar min-h-0 overflow-y-auto p-4">
              {run ? <ClientToolsTab run={run} /> : <EmptyTab>No run selected.</EmptyTab>}
            </TabsContent>
            <TabsContent value="run" className="styled-scrollbar min-h-0 overflow-y-auto p-4">
              {diff && <RunTab snapshot={snapshot} diff={diff} error={bundle.error} />}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function Count({ value }: { value: number }) {
  return <span className="text-muted-foreground ml-1 font-mono text-[10px]">{value}</span>;
}
