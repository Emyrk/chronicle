import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { AlertCircle, Bot, Check, CircleStop, LoaderCircle, LockKeyhole, RotateCcw, ScanSearch, Send, ShieldAlert, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/Switch/Switch";
import { cn } from "@/lib/utils";
import { DebugInspector } from "./DebugInspector";
import { useOptionalInferenceRuntime } from "./runtime";
import type { ChatMessage, ChatToolCall } from "./protocol";
import type { AssistantChatController } from "./useAssistantChat";

export interface ChatPanelProps {
  controller: AssistantChatController;
  title?: string;
  description?: string;
  placeholder?: string;
  emptyState?: ReactNode;
  configuration?: ReactNode;
  disabled?: boolean;
  disabledTitle?: string;
  disabledDescription?: string;
  disabledAction?: ReactNode;
  debugAvailable?: boolean;
  debugEnabled?: boolean;
  onDebugEnabledChange?: (enabled: boolean) => void;
  className?: string;
}

function formattedArguments(value: string): string {
  if (!value) {
    return "Waiting for arguments…";
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function ToolCallCard({ toolCall }: { toolCall: ChatToolCall }) {
  const complete = toolCall.status === "complete";
  const interrupted = toolCall.status === "interrupted";
  return (
    <div className="bg-muted/40 mt-3 overflow-hidden rounded-lg border text-xs">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Wrench className="text-primary size-3.5" />
        <span className="min-w-0 flex-1 truncate font-mono font-medium">{toolCall.name}</span>
        <span className="text-muted-foreground flex items-center gap-1">
          {complete ? <Check className="size-3.5" /> : interrupted ? <AlertCircle className="size-3.5" /> : <LoaderCircle className="size-3.5 animate-spin" />}
          {complete ? "Complete" : interrupted ? "Interrupted" : "Preparing"}
        </span>
      </div>
      <pre className="styled-scrollbar text-muted-foreground max-h-36 overflow-auto p-3 font-mono whitespace-pre-wrap">
        {formattedArguments(toolCall.arguments)}
      </pre>
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const assistant = message.role === "assistant";
  return (
    <article
      className={cn("flex gap-3", !assistant && "justify-end")}
      aria-label={`${assistant ? "Assistant" : "You"} message`}
    >
      {assistant && (
        <div className="bg-primary/10 text-primary mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border">
          <Bot className="size-4" />
        </div>
      )}
      <div
        className={cn(
          "min-w-0 max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm shadow-xs",
          assistant ? "bg-card border" : "bg-primary-darker text-primary-foreground",
        )}
      >
        {assistant ? (
          message.content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-headings:mb-2 prose-headings:mt-4 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-3 prose-pre:max-w-full prose-pre:overflow-auto prose-code:break-words prose-a:text-primary prose-a:underline prose-a:underline-offset-2">
              <ReactMarkdown
                components={{
                  a: ({ children, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : message.streaming && !message.toolCalls?.length ? (
            <span className="text-muted-foreground flex items-center gap-2">
              <LoaderCircle className="size-3.5 animate-spin" /> Thinking…
            </span>
          ) : null
        ) : (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
        {message.interrupted && (
          <p className="text-muted-foreground mt-2 text-xs italic">Response interrupted.</p>
        )}
        {message.toolCalls?.map((toolCall) => (
          <ToolCallCard key={toolCall.id} toolCall={toolCall} />
        ))}
      </div>
    </article>
  );
}

function DefaultEmptyState() {
  return (
    <div className="text-muted-foreground mx-auto flex max-w-64 flex-col items-center gap-3 text-center">
      <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full border">
        <Bot className="size-6" />
      </div>
      <div>
        <p className="text-foreground font-medium">How can I help?</p>
        <p className="mt-1 text-sm">Ask a question to start a new conversation.</p>
      </div>
    </div>
  );
}

export function ChatPanel({
  controller,
  title = "Chronicle Assistant",
  description = "Ask questions and get help without leaving the page.",
  placeholder = "Ask the assistant…",
  emptyState,
  configuration,
  disabled = false,
  disabledTitle = "Connect to use the assistant",
  disabledDescription = "Connect the required provider before starting a conversation.",
  disabledAction,
  debugAvailable = false,
  debugEnabled = false,
  onDebugEnabledChange,
  className,
}: ChatPanelProps) {
  const runtime = useOptionalInferenceRuntime();
  const [composer, setComposer] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [controller.messages]);

  const send = () => {
    if (disabled || controller.isRunning || !composer.trim()) {
      return;
    }
    const content = composer;
    setComposer("");
    void controller.submit(content);
  };

  const startNewChat = () => {
    if (controller.isRunning) return;
    if (controller.messages.length > 0 && !window.confirm("Start a new chat? This clears the persisted conversation history.")) return;
    setComposer("");
    void controller.startNewChat();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <section className={cn("bg-background flex h-full min-h-0 flex-col", className)}>
      <header className="border-b px-5 py-4 pr-12">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="text-primary size-5" />
              <h2 className="font-semibold tracking-tight">{title}</h2>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={startNewChat}
              disabled={controller.isRunning}
              title="Clear this conversation and start over. You can also type /clear."
            >
              <RotateCcw className="size-3.5" />
              New chat
            </Button>
            {runtime && (
              <label className="text-muted-foreground flex items-center gap-2 text-xs" title="Allow view-changing client tools without confirmation for this session">
                <ShieldAlert className="size-3.5" />
                YOLO
                <Switch
                  size="sm"
                  checked={runtime.yoloEnabled}
                  onCheckedChange={runtime.setYoloEnabled}
                  aria-label="Enable YOLO mode for client tools"
                />
              </label>
            )}
            {debugAvailable && (
              <label className="text-muted-foreground flex items-center gap-2 text-xs" title="Capture the exact provider-neutral prompt, tools, and skills">
                <ScanSearch className="size-3.5" />
                Debug
                <Switch
                  size="sm"
                  checked={debugEnabled}
                  onCheckedChange={onDebugEnabledChange}
                  disabled={controller.isRunning}
                  aria-label="Enable prompt debugging"
                />
              </label>
            )}
          </div>
        </div>
      </header>
      {configuration && <div className="border-b px-4 py-3">{configuration}</div>}
      {debugAvailable && debugEnabled && (
        <DebugInspector
          snapshots={controller.debugSnapshots}
          error={controller.error}
          clientToolRequests={controller.clientToolRequests}
        />
      )}

      {disabled ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="bg-muted/30 flex max-w-xs flex-col items-center rounded-xl border border-dashed p-6 text-center">
            <LockKeyhole className="text-muted-foreground size-7" />
            <h3 className="mt-3 font-medium">{disabledTitle}</h3>
            <p className="text-muted-foreground mt-1 text-sm">{disabledDescription}</p>
            {disabledAction && <div className="mt-4">{disabledAction}</div>}
          </div>
        </div>
      ) : (
        <>
          <div className="styled-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5" aria-live="polite">
            {controller.messages.length === 0 ? (
              <div className="flex h-full min-h-48 items-center justify-center">
                {emptyState ?? <DefaultEmptyState />}
              </div>
            ) : (
              <div className="space-y-4">
                {controller.messages.map((message) => (
                  <Message key={message.id} message={message} />
                ))}
                <div ref={messageEndRef} />
              </div>
            )}
          </div>

          <div className="border-t p-4">
            {controller.error && (
              <Alert variant="destructive" className="mb-3">
                <AlertCircle />
                <AlertTitle>Assistant unavailable</AlertTitle>
                <AlertDescription>{controller.error}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSubmit} className="border-input bg-card focus-within:border-ring focus-within:ring-ring/50 rounded-xl border shadow-xs focus-within:ring-3">
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={controller.isRunning}
                rows={3}
                aria-label="Message the assistant"
                className="placeholder:text-muted-foreground styled-scrollbar max-h-40 min-h-20 w-full resize-none bg-transparent px-3.5 pt-3 text-sm outline-none disabled:opacity-60"
              />
              <div className="flex items-center justify-between px-2.5 pb-2.5">
                <span className="text-muted-foreground text-[11px]">Enter to send · Shift+Enter for a new line · /clear starts over</span>
                {controller.isRunning ? (
                  <Button type="button" variant="outline" size="sm" onClick={controller.cancel}>
                    <CircleStop /> Cancel
                  </Button>
                ) : (
                  <Button type="submit" size="sm" disabled={!composer.trim()}>
                    <Send /> Send
                  </Button>
                )}
              </div>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
