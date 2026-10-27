import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, LoaderCircle, Maximize2, MessageCircleMore, Minimize2, Minus, PictureInPicture2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PortalContainerProvider } from "@/components/ui/PortalContainerContext";
import { cn } from "@/lib/utils";
import { ChatPanel, type ChatPanelProps } from "./ChatPanel";
import { useBottomRightAvoidance } from "./floatingAvoidance";
import { useOptionalInferenceRuntime } from "./runtime";
import type { ChatWindowController } from "./useChatWindow";
import { useAssistantChat, type UseAssistantChatOptions } from "./useAssistantChat";

export interface AssistantChatLauncherProps extends React.ComponentProps<typeof Button> {
  label?: string;
  running?: boolean;
}

export function AssistantChatLauncher({
  label = "Ask Chronicle",
  variant = "default",
  running = false,
  style,
  ...props
}: AssistantChatLauncherProps) {
  const { ref, offset } = useBottomRightAvoidance<HTMLButtonElement>();
  const transform = offset > 0
    ? `${style?.transform ? `${style.transform} ` : ""}translateY(-${offset}px)`
    : style?.transform;

  return (
    <Button ref={ref} variant={variant} style={{ ...style, transform }} {...props}>
      {running ? <LoaderCircle className="animate-spin" /> : <MessageCircleMore />}
      {label}
    </Button>
  );
}

export interface AssistantChatProps
  extends UseAssistantChatOptions,
    Omit<ChatPanelProps, "controller" | "windowControls"> {
  chatWindow: ChatWindowController;
  launcherLabel?: string;
  launcherClassName?: string;
}

function WindowControlButton({ label, onClick, children, className }: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button type="button" variant="ghost" size="icon" className={cn("size-7", className)} onClick={onClick} title={label} aria-label={label}>
      {children}
    </Button>
  );
}

function ChatWindowControls({ chatWindow }: { chatWindow: ChatWindowController }) {
  if (chatWindow.mode === "popout") {
    return (
      <WindowControlButton label="Dock chat back into the page" onClick={chatWindow.dock}>
        <PictureInPicture2 />
      </WindowControlButton>
    );
  }
  return (
    <>
      <WindowControlButton
        label={chatWindow.expanded ? "Shrink chat" : "Expand chat"}
        onClick={chatWindow.toggleExpanded}
        className="max-sm:hidden"
      >
        {chatWindow.expanded ? <Minimize2 /> : <Maximize2 />}
      </WindowControlButton>
      <WindowControlButton label="Pop out chat into a new window" onClick={chatWindow.popOut} className="max-sm:hidden">
        <ExternalLink />
      </WindowControlButton>
      <WindowControlButton label="Minimize chat" onClick={chatWindow.minimize}>
        <Minus />
      </WindowControlButton>
    </>
  );
}

export function AssistantChat({
  chatWindow,
  launcherLabel,
  launcherClassName,
  title = "Chronicle Assistant",
  description = "Ask questions and get help without leaving the page.",
  endpoint,
  headers,
  initialMessages,
  threadId,
  createRequest,
  onMessagesChange,
  onDebugCommand,
  onRunComplete,
  onRunSettled,
  onStartNewChat,
  runClient,
  ...panelProps
}: AssistantChatProps) {
  const controller = useAssistantChat({
    endpoint,
    headers,
    initialMessages,
    threadId,
    createRequest,
    onMessagesChange,
    onDebugCommand,
    onRunComplete,
    onRunSettled,
    onStartNewChat,
    runClient,
  });
  const runtime = useOptionalInferenceRuntime();
  const pendingConfirmation = Boolean(runtime?.pendingConfirmation);
  const { mode, popup, open } = chatWindow;

  // Tool approvals are rendered inside the chat, so surface it when one arrives.
  useEffect(() => {
    if (pendingConfirmation && mode === "minimized") open();
  }, [mode, open, pendingConfirmation]);

  const panel = (
    <ChatPanel
      {...panelProps}
      controller={controller}
      title={title}
      description={description}
      windowControls={<ChatWindowControls chatWindow={chatWindow} />}
    />
  );

  if (mode === "popout" && popup) {
    return (
      <>
        {createPortal(
          <PortalContainerProvider container={popup.container}>{panel}</PortalContainerProvider>,
          popup.container,
        )}
        <AssistantChatLauncher
          label="Chat popped out"
          variant="outline"
          className={launcherClassName}
          onClick={() => popup.window.focus()}
          title="Focus the popped-out chat window"
        />
      </>
    );
  }

  const minimized = mode === "minimized";
  return (
    <>
      {minimized && (
        <AssistantChatLauncher
          label={launcherLabel}
          className={launcherClassName}
          onClick={open}
          running={controller.isRunning}
        />
      )}
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "bg-background fixed inset-0 z-[90] flex flex-col overflow-hidden",
          "sm:inset-auto sm:right-4 sm:bottom-4 sm:rounded-xl sm:border sm:shadow-2xl",
          chatWindow.expanded
            ? "sm:h-[calc(100dvh-2rem)] sm:w-[min(760px,calc(100vw-2rem))]"
            : "sm:h-[min(760px,calc(100dvh-2rem))] sm:w-[min(440px,calc(100vw-2rem))]",
          minimized && "hidden",
        )}
      >
        {panel}
      </div>
    </>
  );
}
