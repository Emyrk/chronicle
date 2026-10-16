import { useState } from "react";
import { Check, Clipboard, KeyRound, Loader2, LockKeyhole, ShieldCheck, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import {
  useCreatePrivateLogShare,
  usePrivateLogAccessRequests,
  useUpdatePrivateLogAccessRequest,
  type PrivateLogAccessRequest,
} from "@/api/privateLogs";

function statusClasses(status: PrivateLogAccessRequest["status"]): string {
  switch (status) {
    case "approved": return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "pending": return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "denied":
    case "revoked": return "border-red-500/30 bg-red-500/10 text-red-300";
    default: return "border-border bg-muted text-muted-foreground";
  }
}

export function PrivateBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300 ${className}`}>
      <LockKeyhole className="h-3 w-3" />
      Private
    </span>
  );
}

export function PrivateLogAccessPanel({ logId }: { logId: string }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const createShare = useCreatePrivateLogShare();
  const requests = usePrivateLogAccessRequests(logId);
  const updateRequest = useUpdatePrivateLogAccessRequest(logId);

  const createAndCopy = async () => {
    try {
      const share = await createShare.mutateAsync(logId);
      const absoluteUrl = new URL(share.url, window.location.origin).toString();
      setShareUrl(absoluteUrl);
      await navigator.clipboard.writeText(absoluteUrl);
      toast.success("Request link copied", {
        description: "Anyone opening it must sign in and request your approval.",
      });
    } catch (error) {
      toast.error("Could not create share link", { description: error instanceof Error ? error.message : undefined });
    }
  };

  const mutate = async (requestId: string, action: "approve" | "deny" | "revoke") => {
    try {
      await updateRequest.mutateAsync({ requestId, action });
      toast.success(action === "approve" ? "Access approved" : action === "deny" ? "Request denied" : "Access revoked");
    } catch (error) {
      toast.error(`Could not ${action} access`, { description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <Card className="p-6 space-y-5 border-amber-500/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
            Private access
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Share a request-only link. Opening the link never grants access by itself; you approve each viewer below.
          </p>
        </div>
        <Button variant="outline" onClick={() => void createAndCopy()} disabled={createShare.isPending}>
          {createShare.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clipboard className="mr-2 h-4 w-4" />}
          Create & copy link
        </Button>
      </div>

      {shareUrl && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{shareUrl}</span>
          <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => toast.success("Link copied"))}>
            Copy
          </Button>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Access requests</h3>
          {requests.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {requests.error ? (
          <p className="text-sm text-destructive">{requests.error.message}</p>
        ) : !requests.data?.length ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No one has requested access yet.
          </div>
        ) : (
          <div className="space-y-2">
            {requests.data.map((request) => {
              const name = request.user_name ?? request.username ?? request.user_id ?? "Chronicle user";
              const busy = updateRequest.isPending && updateRequest.variables?.requestId === request.id;
              return (
                <div key={request.id} className="flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{name}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusClasses(request.status)}`}>
                        {request.status}
                      </span>
                    </div>
                    {request.created_at && <p className="mt-1 text-xs text-muted-foreground">Requested {new Date(request.created_at).toLocaleString()}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {request.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => void mutate(request.id, "approve")} disabled={busy}>
                          <Check className="mr-1.5 h-4 w-4" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void mutate(request.id, "deny")} disabled={busy}>
                          <X className="mr-1.5 h-4 w-4" /> Deny
                        </Button>
                      </>
                    )}
                    {request.status === "approved" && (
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => void mutate(request.id, "revoke")} disabled={busy}>
                        <UserX className="mr-1.5 h-4 w-4" /> Revoke
                      </Button>
                    )}
                    {(request.status === "denied" || request.status === "revoked") && (
                      <Button size="sm" variant="outline" onClick={() => void mutate(request.id, "approve")} disabled={busy}>
                        <Check className="mr-1.5 h-4 w-4" /> Approve
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
