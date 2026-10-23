import { MessageCircleMore } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChatPanel, type ChatPanelProps } from "./ChatPanel";
import { useAssistantChat, type UseAssistantChatOptions } from "./useAssistantChat";

export interface AssistantChatLauncherProps extends React.ComponentProps<typeof Button> {
  label?: string;
}

export function AssistantChatLauncher({
  label = "Ask Chronicle",
  variant = "default",
  ...props
}: AssistantChatLauncherProps) {
  return (
    <Button variant={variant} {...props}>
      <MessageCircleMore />
      {label}
    </Button>
  );
}

export interface AssistantChatProps
  extends UseAssistantChatOptions,
    Omit<ChatPanelProps, "controller"> {
  launcherLabel?: string;
  launcherClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AssistantChat({
  launcherLabel,
  launcherClassName,
  open,
  onOpenChange,
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <AssistantChatLauncher label={launcherLabel} className={launcherClassName} />
      </SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <ChatPanel
          {...panelProps}
          controller={controller}
          title={title}
          description={description}
        />
      </SheetContent>
    </Sheet>
  );
}
