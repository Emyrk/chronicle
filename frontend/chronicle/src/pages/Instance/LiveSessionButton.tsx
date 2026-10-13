import { Loader2, Radio, Unplug, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
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
      <Button variant="outline" size="sm" className="gap-1.5 text-destructive" onClick={session.leave}>
        <Unplug className="h-4 w-4" />
        Live error
      </Button>
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
              : "Following live"
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
