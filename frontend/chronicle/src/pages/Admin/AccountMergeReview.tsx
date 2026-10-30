import { useState } from "react";
import { Check, GitMerge, X } from "lucide-react";
import { toast } from "sonner";
import { useAdminAccountMergeRequests, useDecideAccountMergeRequest } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AccountMergeReview() {
  const { data: requests = [], isLoading, error } = useAdminAccountMergeRequests();
  const decide = useDecideAccountMergeRequest();
  const [responses, setResponses] = useState<Record<string, string>>({});

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading merge requests...</p>;
  if (error) return <p className="p-6 text-sm text-destructive">{error.message}</p>;

  const pending = requests.filter((request) => request.status === "pending");
  const decided = requests.filter((request) => request.status !== "pending");

  const submit = (id: string, approved: boolean) => {
    decide.mutate({ id, approved, response: responses[id]?.trim() ?? "" }, {
      onSuccess: () => toast.success(approved ? "Accounts merged" : "Merge request rejected"),
      onError: (mutationError) => toast.error("Merge decision failed", { description: mutationError.message }),
    });
  };

  const renderRequest = (request: (typeof requests)[number]) => {
    const blocked = request.source_blockers.length > 0;
    return <article key={request.id} className="rounded-lg border">
      <header className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <GitMerge className="size-4" />
        <span className="font-medium">Merge duplicate account</span>
        <span className={cn(
          "ml-auto rounded-full px-2 py-0.5 text-xs font-medium capitalize",
          request.status === "pending" && "bg-yellow-500/10 text-yellow-500",
          request.status === "approved" && "bg-green-500/10 text-green-500",
          request.status === "rejected" && "bg-destructive/10 text-destructive",
        )}>{request.status}</span>
      </header>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="rounded-md border p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Duplicate Discord account to remove</p>
          <p className="mt-2 font-medium">{request.source_username}</p>
          <p className="text-muted-foreground">{request.source_email || "No email"}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">User {request.source_user_id}</p>
          <p className="font-mono text-xs text-muted-foreground">Discord {request.discord_id}</p>
        </div>
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Canonical password account to keep</p>
          <p className="mt-2 font-medium">{request.target_username}</p>
          <p className="text-muted-foreground">{request.target_email}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">User {request.target_user_id}</p>
        </div>
      </div>
      <div className="space-y-3 border-t p-4">
        <p className="text-sm text-muted-foreground">{request.message}</p>
        {blocked && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
          Approval is blocked until these are resolved: {request.source_blockers.join(", ")}.
        </div>}
        {request.status === "pending" ? <>
          <label className="block space-y-1 text-sm">
            <span>Response to user</span>
            <textarea
              className="min-h-20 w-full rounded-md border bg-background p-2"
              maxLength={2000}
              value={responses[request.id] ?? ""}
              onChange={(event) => setResponses((current) => ({ ...current, [request.id]: event.target.value }))}
              placeholder="Explain the approval, rejection, or blockers"
            />
          </label>
          <p className="text-xs text-muted-foreground">Approval moves the Discord sign-in method, deletes the empty duplicate account, and signs the canonical account out everywhere.</p>
          <div className="flex gap-2">
            <Button disabled={blocked || decide.isPending} onClick={() => submit(request.id, true)}>
              <Check className="size-4" /> Approve and merge
            </Button>
            <Button variant="destructive" disabled={decide.isPending} onClick={() => submit(request.id, false)}>
              <X className="size-4" /> Reject
            </Button>
          </div>
        </> : request.response && <p className="text-sm"><span className="text-muted-foreground">Response:</span> {request.response}</p>}
      </div>
    </article>;
  };

  return <div className="space-y-6 p-4 sm:p-6">
    <div>
      <h1 className="text-2xl font-semibold">Account Merge Requests</h1>
      <p className="text-muted-foreground">Approve Discord-to-password merges only after reviewing both account IDs and all blockers.</p>
    </div>
    {pending.length === 0 ? <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">No pending account merges.</div> : <div className="space-y-4">{pending.map(renderRequest)}</div>}
    {decided.length > 0 && <section className="space-y-3">
      <h2 className="text-lg font-medium">Recent decisions</h2>
      {decided.map(renderRequest)}
    </section>}
  </div>;
}
