import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3, Loader2, LockKeyhole, LogIn, Send } from "lucide-react";
import { toast } from "sonner";
import { usePrivateLogShare, useRequestPrivateLogAccess } from "@/api/privateLogs";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";

export function PrivateLogSharePage() {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const share = usePrivateLogShare(code, { enabled: Boolean(code) });
  const requestAccess = useRequestPrivateLogAccess(code);
  const metadata = share.data;
  const accessStatus = metadata?.access_status ?? metadata?.request_status ?? metadata?.access?.access_status ?? metadata?.access?.request_status ?? "none";
  const approved = metadata?.has_access || accessStatus === "approved";
  const destination = metadata?.instance_slug || metadata?.instance_id
    ? `/instances/${metadata.instance_slug ?? metadata.instance_id}`
    : metadata?.log_id
      ? `/logs/${metadata.log_id}`
      : null;

  useEffect(() => {
    if (approved && destination) navigate(destination, { replace: true });
  }, [approved, destination, navigate]);

  const request = async () => {
    try {
      await requestAccess.mutateAsync();
      toast.success(accessStatus === "denied" || accessStatus === "revoked" ? "Access requested again" : "Access requested", {
        description: "The log owner must approve you before Chronicle exposes any combat data.",
      });
    } catch (error) {
      toast.error("Could not request access", { description: error instanceof Error ? error.message : undefined });
    }
  };

  if (authLoading || share.isLoading || (approved && destination)) {
    return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (share.error || !metadata) {
    return (
      <div className="mx-auto max-w-xl p-6 md:p-10">
        <Card className="p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">Private share unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{share.error?.message ?? "This link is invalid or has expired."}</p>
        </Card>
      </div>
    );
  }

  const title = metadata.instance_name ?? metadata.log_name ?? "Private raid log";

  return (
    <div className="mx-auto max-w-xl p-6 md:p-10">
      <Card className="overflow-hidden border-amber-500/20">
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-6 py-7 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
            <LockKeyhole className="h-6 w-6 text-amber-300" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {metadata.owner_name ? `${metadata.owner_name} shared a private Chronicle log.` : "A Chronicle user shared a private log."}
          </p>
        </div>
        <div className="space-y-5 p-6">
          {!isAuthenticated ? (
            <>
              <p className="text-sm text-muted-foreground">
                Sign in to request access. This link contains metadata only and never grants bearer access to combat data.
              </p>
              <Button asChild className="w-full">
                <Link to={`/login?from=${encodeURIComponent(`/private-log-shares/${code}`)}`}>
                  <LogIn className="mr-2 h-4 w-4" /> Sign in to request access
                </Link>
              </Button>
            </>
          ) : accessStatus === "pending" ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center">
              <Clock3 className="mx-auto h-6 w-6 text-amber-300" />
              <h2 className="mt-2 font-semibold">Request pending</h2>
              <p className="mt-1 text-sm text-muted-foreground">The owner will decide whether to grant access.</p>
            </div>
          ) : (
            <>
              {(accessStatus === "denied" || accessStatus === "revoked") && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
                  <div className="flex items-center gap-2 font-medium text-red-300"><AlertCircle className="h-4 w-4" /> Access {accessStatus}</div>
                  <p className="mt-1 text-muted-foreground">You can ask the owner to reconsider by sending a new request.</p>
                </div>
              )}
              {accessStatus === "none" && (
                <div className="flex gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <p>The owner will see your Chronicle identity and can approve, deny, or later revoke access.</p>
                </div>
              )}
              <Button className="w-full" onClick={() => void request()} disabled={requestAccess.isPending}>
                {requestAccess.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {accessStatus === "denied" || accessStatus === "revoked" ? "Request access again" : "Request access"}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
