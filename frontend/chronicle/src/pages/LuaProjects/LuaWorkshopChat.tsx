import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { Link } from "react-router-dom"
import { Code2, LoaderCircle, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { ChatPanel } from "@/features/chat/ChatPanel"
import { AssistantConfiguration, ConnectRequiredAction } from "@/features/chat/InferenceChats"
import {
  isInferenceAuthorizationError,
  isInferenceServiceUnavailable,
  useClearInferenceThread,
  useCreateLuaProjectInferenceThread,
  useInferenceDebugPermission,
  useInferenceDebugPreview,
  useInferencePermission,
  useInferenceThread,
} from "@/features/chat/api"
import { buildLuaWorkshopRunRequest, toChatMessages } from "@/features/chat/inference"
import { useAssistantChat, type DebugCommandInput, type UseAssistantChatOptions } from "@/features/chat/useAssistantChat"
import { useInferenceSelection } from "@/features/chat/useInferenceSelection"
import { usageFromApi } from "@/features/chat/usage"

type PanelProps = Omit<React.ComponentProps<typeof ChatPanel>, "controller">

/** A message another part of the workshop asks the chat to send, e.g. from the preview's error card. */
export interface WorkshopChatRequest { id: number; text: string }

function WorkshopChatPanel({ chat, panel, ideas, request, sentRef }: {
  chat: UseAssistantChatOptions; panel: PanelProps; ideas: boolean; request?: WorkshopChatRequest
  /** Owned by the parent so a request is sent once even though this panel remounts per thread. */
  sentRef: RefObject<number | undefined>
}) {
  const controller = useAssistantChat(chat)
  const { isRunning, submit } = controller
  useEffect(() => {
    if (!request || sentRef.current === request.id || panel.disabled || isRunning) return
    sentRef.current = request.id
    void submit(request.text)
  }, [request, panel.disabled, isRunning, submit, sentRef])
  const emptyState = ideas && !panel.disabled ? <EmptyState onPick={text => void controller.submit(text)} /> : panel.emptyState
  return <ChatPanel {...panel} emptyState={emptyState} controller={controller} />
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const ideas = ["Show total damage as a big number", "Rank players by damage with bars", "Track the top 5 damage targets"]
  return <div className="mx-auto max-w-sm text-center text-sm text-muted-foreground">
    <Sparkles className="mx-auto mb-3 size-8 text-primary" />
    <p className="font-medium text-foreground">What should this panel do?</p>
    <p className="mt-2">The assistant reads and edits your unsaved main.lua, project.json and README.md, and can run a startup check or a preview on your selected encounters. Nothing is saved until you click Save to main.</p>
    <div className="mt-4 flex flex-col gap-2">
      {ideas.map(idea => <button key={idea} type="button" onClick={() => onPick(idea)}
        className="rounded-md border border-border px-3 py-2 text-left text-xs text-foreground hover:bg-accent">{idea}</button>)}
    </div>
  </div>
}

/** Durable per-project chat. Tools come from the page's lua-editor capability. */
export function LuaWorkshopChat({ projectId, projectName, windowControls, onShowCode, request }: {
  projectId: string; projectName: string; windowControls?: React.ReactNode
  /** Sent once the chat is ready and idle. */
  request?: WorkshopChatRequest
  /** Set while chat holds the main area; lets users without chat bring the code there instead. */
  onShowCode?: () => void
}) {
  const { session, isAuthenticated } = useAuth()
  const permission = useInferencePermission(isAuthenticated, "module-workshop-panel")
  const debugPermission = useInferenceDebugPermission(isAuthenticated && permission.allowed)
  const selection = useInferenceSelection(session?.user_id, isAuthenticated && permission.allowed)
  const debugPreview = useInferenceDebugPreview()
  const clearThread = useClearInferenceThread()
  const createThread = useCreateLuaProjectInferenceThread()
  const [debugEnabled, setDebugEnabled] = useState(false)
  const sentRequest = useRef<number | undefined>(undefined)
  const threadId = createThread.data?.thread.id
  const threadQuery = useInferenceThread(threadId, { enabled: false })

  useEffect(() => {
    if (permission.allowed && selection.ready && !createThread.data && !createThread.isPending && !createThread.error) {
      createThread.mutate(projectId)
    }
  }, [permission.allowed, selection.ready, createThread, projectId])

  const refreshThread = useCallback(async () => { await threadQuery.refetch() }, [threadQuery])
  const startNewChat = useCallback(async () => {
    if (!threadId) return []
    const cleared = await clearThread.mutateAsync(threadId)
    return toChatMessages(cleared.messages)
  }, [clearThread, threadId])
  const previewDebug = useCallback(async (input: DebugCommandInput) => {
    if (!threadId || !selection.modelId) throw new Error("Open the conversation and select a model first.")
    const snapshot = await debugPreview.mutateAsync({
      assistant_id: "module-workshop-panel", thread_id: threadId, model: selection.modelId,
      ...(input.client ? { client: input.client } : {}),
    })
    setDebugEnabled(true)
    return { snapshot }
  }, [debugPreview, selection.modelId, threadId])
  const createRequest = useCallback((input: Parameters<typeof buildLuaWorkshopRunRequest>[0]) => {
    if (!selection.connectionId || !selection.modelId) throw new Error("Select an AI connection and model first.")
    return buildLuaWorkshopRunRequest(input, { connectionId: selection.connectionId, modelId: selection.modelId }, debugEnabled)
  }, [debugEnabled, selection.connectionId, selection.modelId])

  const showCodeButton = onShowCode && <Button size="sm" variant="outline" onClick={onShowCode}><Code2 className="size-4" /> Open code here</Button>

  if (!isAuthenticated || !permission.allowed || isInferenceServiceUnavailable(selection.error)) {
    return <div className="flex h-full flex-col">
      <div className="flex justify-end border-b border-border p-1.5">{windowControls}</div>
      <div className="m-auto flex max-w-xs flex-col items-center gap-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">AI chat isn't available for this account, or the Module Workshop assistant is turned off in your <Link className="text-primary underline underline-offset-2" to="/account/ai">AI settings</Link>. You can still edit and test the code directly.</p>
        {showCodeButton}
      </div>
    </div>
  }
  if (selection.isLoading) {
    return <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading AI configuration…</div>
  }
  const response = threadQuery.data ?? createThread.data
  const disconnected = selection.connections.length === 0
  const threadError = createThread.error ?? threadQuery.error
  const threadLoading = selection.ready && !response && !threadError
  const initialMessages = response ? toChatMessages(response.messages) : []

  return <WorkshopChatPanel
    // Keep the controller mounted across thread refreshes; remounting aborts client-tool continuations.
    key={response?.thread.id ?? "pending"}
    ideas={!threadLoading}
    request={request}
    sentRef={sentRequest}
    chat={{
      endpoint: "/api/v1/inference/runs", threadId: response?.thread.id, initialMessages, createRequest,
      initialUsage: response?.usage && usageFromApi(response.usage),
      onDebugCommand: debugPermission.allowed ? previewDebug : undefined, onStartNewChat: startNewChat, onRunSettled: refreshThread,
    }}
    panel={{
      title: `${projectName} · Module Workshop`,
      description: "Builds your panel in the unsaved working copy. Responses can be inaccurate; review before saving.",
      placeholder: "Describe what the panel should show…",
      configuration: selection.connections.length > 0 ? <AssistantConfiguration selection={selection} /> : undefined,
      emptyState: threadLoading
        ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading conversation…</div>
        : undefined,
      debugAvailable: debugPermission.allowed, debugEnabled, onDebugEnabledChange: setDebugEnabled,
      disabled: disconnected || Boolean(selection.error || threadError) || threadLoading,
      disabledTitle: disconnected ? "Connect OpenRouter to use the Module Workshop chat"
        : threadLoading ? "Opening Module Workshop chat"
        : isInferenceAuthorizationError(threadError) ? "Assistant authorization expired" : "Workshop chat unavailable",
      disabledDescription: selection.error?.message ?? threadError?.message ?? (threadLoading ? "Loading conversation history…" : "Connect a provider in account settings, then choose a model."),
      disabledAction: (disconnected || showCodeButton) && <div className="flex flex-wrap justify-center gap-2">
        {disconnected && <ConnectRequiredAction />}
        {!threadLoading && showCodeButton}
      </div>,
      windowControls,
      className: "h-full",
    }}
  />
}
