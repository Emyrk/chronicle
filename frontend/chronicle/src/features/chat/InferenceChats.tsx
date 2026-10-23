import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { AssistantChat } from "./AssistantChat";
import {
  isInferenceServiceUnavailable,
  useCreateInstanceInferenceThread,
  useInferenceDebugPermission,
  useInferencePermission,
  useInferenceThread,
} from "./api";
import { buildInstanceAnalystRunRequest, buildSiteHelpRunRequest, toChatMessages } from "./inference";
import { ModelCombobox } from "./ModelCombobox";
import { useInferenceSelection } from "./useInferenceSelection";

function AssistantConfiguration({
  selection,
}: {
  selection: ReturnType<typeof useInferenceSelection>;
}) {
  if (selection.isLoading) {
    return <span className="text-muted-foreground flex items-center gap-2 text-xs"><LoaderCircle className="size-3.5 animate-spin" /> Loading AI configuration…</span>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="text-muted-foreground text-xs">
        Connection
        <select
          className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
          value={selection.connectionId ?? ""}
          onChange={(event) => selection.setConnectionId(event.target.value || undefined)}
        >
          {selection.connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.label}</option>)}
        </select>
      </label>
      <div className="text-muted-foreground min-w-0 text-xs">
        <span>Model</span>
        <ModelCombobox
          models={selection.models}
          value={selection.modelId}
          onChange={selection.setModelId}
        />
      </div>
    </div>
  );
}

function ConnectRequiredAction() {
  return <Button asChild size="sm"><Link to="/account/settings">Open AI settings</Link></Button>;
}

function SiteHelpEmptyState() {
  return (
    <div className="text-muted-foreground mx-auto max-w-72 text-center text-sm">
      <Bot className="text-primary mx-auto mb-3 size-9" />
      <p className="text-foreground font-medium">What can Chronicle help you find?</p>
      <p className="mt-2">Try “Where can I upload a combat log?” or “How do rankings and parse scores work?”</p>
    </div>
  );
}

export function GlobalSiteHelpChat() {
  const { session, isAuthenticated } = useAuth();
  const permission = useInferencePermission(isAuthenticated);
  const debugPermission = useInferenceDebugPermission(isAuthenticated && permission.allowed);
  const selection = useInferenceSelection(session?.user_id, isAuthenticated && permission.allowed);
  const [open, setOpen] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const createRequest = useCallback((input: Parameters<typeof buildSiteHelpRunRequest>[0]) => {
    if (!selection.connectionId || !selection.modelId) throw new Error("Select an AI connection and model first.");
    return buildSiteHelpRunRequest(input, { connectionId: selection.connectionId, modelId: selection.modelId }, debugEnabled);
  }, [debugEnabled, selection.connectionId, selection.modelId]);

  if (
    !isAuthenticated
    || !permission.allowed
    || selection.isLoading
    || isInferenceServiceUnavailable(selection.error)
  ) return null;
  const disconnected = selection.connections.length === 0;
  return (
    <AssistantChat
      open={open}
      onOpenChange={setOpen}
      endpoint="/api/v1/inference/runs"
      createRequest={createRequest}
      launcherLabel="Ask Chronicle"
      launcherClassName="fixed right-4 bottom-4 z-40 rounded-full shadow-lg sm:right-6 sm:bottom-6"
      title="Chronicle site help"
      description="Get help navigating Chronicle and understanding its features. Responses can be inaccurate."
      emptyState={<SiteHelpEmptyState />}
      configuration={selection.connections.length > 0 ? <AssistantConfiguration selection={selection} /> : undefined}
      debugAvailable={debugPermission.allowed}
      debugEnabled={debugEnabled}
      onDebugEnabledChange={setDebugEnabled}
      disabled={disconnected || Boolean(selection.error)}
      disabledTitle={selection.error ? "AI configuration unavailable" : "Connect OpenRouter to start chatting"}
      disabledDescription={selection.error?.message ?? "Connect your user-funded OpenRouter account in settings. Chronicle never receives your OpenRouter password."}
      disabledAction={<ConnectRequiredAction />}
      className="h-dvh sm:h-[min(760px,100vh)]"
    />
  );
}

export function InstanceAssistantChat({ instanceId, instanceName }: { instanceId: string; instanceName: string }) {
  const { session, isAuthenticated } = useAuth();
  const permission = useInferencePermission(isAuthenticated);
  const debugPermission = useInferenceDebugPermission(isAuthenticated && permission.allowed);
  const selection = useInferenceSelection(session?.user_id, isAuthenticated && permission.allowed);
  const createThread = useCreateInstanceInferenceThread();
  const [open, setOpen] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const threadId = createThread.data?.thread.id;
  const threadQuery = useInferenceThread(threadId, { enabled: false });

  useEffect(() => {
    if (open && permission.allowed && selection.ready && !createThread.data && !createThread.isPending) {
      createThread.mutate(instanceId);
    }
  }, [open, permission.allowed, selection.ready, createThread, instanceId]);

  const refreshThread = useCallback(async () => {
    await threadQuery.refetch();
  }, [threadQuery]);
  const createRequest = useCallback((input: Parameters<typeof buildInstanceAnalystRunRequest>[0]) => {
    if (!selection.connectionId || !selection.modelId) throw new Error("Select an AI connection and model first.");
    return buildInstanceAnalystRunRequest(input, { connectionId: selection.connectionId, modelId: selection.modelId }, instanceId, debugEnabled);
  }, [debugEnabled, instanceId, selection.connectionId, selection.modelId]);

  if (
    !isAuthenticated
    || !permission.allowed
    || selection.isLoading
    || isInferenceServiceUnavailable(selection.error)
  ) return null;
  const response = threadQuery.data ?? createThread.data;
  const disconnected = selection.connections.length === 0;
  const threadLoading = open && selection.ready && !response && !createThread.error;

  return (
    <AssistantChat
      // Keep the controller mounted when updated_at changes after a refresh;
      // remounting aborts in-flight client-tool continuation and closes the sheet.
      key={response?.thread.id ?? "pending"}
      open={open}
      onOpenChange={setOpen}
      endpoint="/api/v1/inference/runs"
      threadId={response?.thread.id}
      initialMessages={response ? toChatMessages(response.messages) : []}
      createRequest={createRequest}
      onRunSettled={refreshThread}
      launcherLabel="Ask about this raid"
      launcherClassName="fixed right-4 bottom-20 z-[90] rounded-full shadow-lg sm:right-6 sm:bottom-6"
      title={`${instanceName} assistant`}
      description="Analyze this instance with its persisted conversation history. Responses can be inaccurate."
      configuration={selection.connections.length > 0 ? <AssistantConfiguration selection={selection} /> : undefined}
      emptyState={threadLoading ? <div className="text-muted-foreground flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" /> Loading conversation…</div> : undefined}
      debugAvailable={debugPermission.allowed}
      debugEnabled={debugEnabled}
      onDebugEnabledChange={setDebugEnabled}
      disabled={disconnected || Boolean(selection.error || createThread.error) || threadLoading}
      disabledTitle={disconnected ? "Connect OpenRouter to analyze this raid" : threadLoading ? "Opening instance assistant" : "Instance assistant unavailable"}
      disabledDescription={selection.error?.message ?? createThread.error?.message ?? (threadLoading ? "Loading persisted conversation history…" : "Connect a provider in account settings, then choose a model.")}
      disabledAction={disconnected ? <ConnectRequiredAction /> : undefined}
      className="h-dvh sm:h-[min(760px,100vh)]"
    />
  );
}
