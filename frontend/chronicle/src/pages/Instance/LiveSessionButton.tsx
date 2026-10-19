import { Loader2, Radio, RefreshCw, Unplug, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { useLiveSession } from "./LiveSessionContext";

export function LiveSessionButton({ instanceId, canCreate }: { instanceId: string; canCreate: boolean }) {
  const session = useLiveSession();

  const start = async (password?: string) => {
    try {
      const url = await session.create(instanceId, password);
      await navigator.clipboard.writeText(url);
      toast.success("Live session started", { description: "Invite link copied to your clipboard." });
    } catch (error) {
      toast.error("Failed to start live session", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const joinProtected = async () => {
    if (!session.code) return;
    const password = window.prompt("Enter the live session password");
    if (password === null) return;
    try {
      await session.join(session.code, instanceId, password);
    } catch (error) {
      toast.error("Failed to join live session", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const copyInvite = async () => {
    if (!session.inviteURL) return;
    await navigator.clipboard.writeText(session.inviteURL);
    toast.success("Invite link copied");
  };

  const resync = () => {
    session.resyncView();
    toast.info("Requesting the leader's latest view");
  };

  if (session.status === "needs_password") {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { void joinProtected(); }}>
        <Radio className="h-4 w-4 text-amber-400" />
        Enter live password
      </Button>
    );
  }

  if (session.status === "connecting") {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        Connecting
      </Button>
    );
  }

  if (session.status === "ended") {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 border-amber-500/40 text-amber-300"
        onClick={session.leave}
        title="The leader disconnected. The current page remains fully usable."
      >
        <Unplug className="h-4 w-4" />
        Session ended
      </Button>
    );
  }

  if (session.status === "error") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-destructive" onClick={session.leave}>
            <Unplug className="h-4 w-4" />
            Live error
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-80">
          {session.error ?? "The live session connection failed."}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={session.status === "live" ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          disabled={session.status === "idle" && !canCreate}
          title={!canCreate && session.status === "idle" ? "Sign in to start a live session" : undefined}
        >
          {session.status === "live" ? <Users className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
          {session.status === "live"
            ? session.role === "leader"
              ? `Live · ${session.participantCount + 1}`
              : session.viewSynchronized ? "Following live" : "Syncing live"
            : "Live session"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {session.status === "idle" ? (
          <>
            <DropdownMenuItem onClick={() => { void start(); }}>
              Start public session
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const password = window.prompt("Choose a password for this live session");
              if (password) void start(password);
            }}>
              Start password-protected session
            </DropdownMenuItem>
          </>
        ) : (
          <>
            {session.role === "leader" && session.inviteURL && (
              <DropdownMenuItem onClick={() => { void copyInvite(); }}>
                Copy invite link
              </DropdownMenuItem>
            )}
            {session.role === "participant" && (
              <DropdownMenuItem onClick={resync}>
                <RefreshCw className={session.viewSynchronized ? "h-4 w-4" : "h-4 w-4 animate-spin"} />
                Resync with leader
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={session.viewboxSettings.showViewboxes}
              onCheckedChange={(checked) => session.setViewboxSettings((previous) => ({ ...previous, showViewboxes: checked }))}
            >
              Show participant viewboxes
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={session.viewboxSettings.showLabels}
              disabled={!session.viewboxSettings.showViewboxes}
              onCheckedChange={(checked) => session.setViewboxSettings((previous) => ({ ...previous, showLabels: checked }))}
            >
              Show viewbox labels
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={session.viewboxSettings.showCommonArea}
              onCheckedChange={(checked) => session.setViewboxSettings((previous) => ({ ...previous, showCommonArea: checked }))}
            >
              Show common area
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={session.leave}>
              {session.role === "leader" ? "End session" : "Leave session"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
