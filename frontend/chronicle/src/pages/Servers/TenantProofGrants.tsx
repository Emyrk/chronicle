import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminUsers } from "@/api/queries";
import type { TenantProofGrant } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";

async function readResponse(response: Response) {
  if (response.ok) return response.json();
  const body = await response.json().catch(() => null);
  throw new Error(body?.message ?? `Request failed (${response.status})`);
}

export function TenantProofGrants({ tenantID }: { tenantID: string }) {
  const [userID, setUserID] = useState("");
  const client = useQueryClient();
  const endpoint = `/api/v1/linked/admin/tenants/${encodeURIComponent(tenantID)}/proof-grants`;
  const { data: users, error: usersError } = useAdminUsers();
  const { data: grants, isLoading, error } = useQuery({
    queryKey: ["tenant-proof-grants", tenantID],
    queryFn: async () => readResponse(await fetch(endpoint, { credentials: "include" })) as Promise<TenantProofGrant[]>,
  });
  const update = useMutation({
    mutationFn: async (grant: TenantProofGrant) => readResponse(await fetch(`${endpoint}/${encodeURIComponent(grant.user_id)}`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(grant),
    })) as Promise<TenantProofGrant>,
    onSuccess: () => client.invalidateQueries({ queryKey: ["tenant-proof-grants", tenantID] }),
  });
  const accounts = users?.users ?? [];
  const granted = grants ?? [];
  const selected = granted.find((grant) => grant.user_id === userID);

  return <div className="mt-3 space-y-3 border-t pt-3 text-sm">
    <div>
      <h4 className="font-medium">Photo proof access</h4>
      <p className="text-xs text-muted-foreground">Grant submission and review separately for this tenant. Tenant admins are not reviewers by default.</p>
    </div>
    {(error || usersError || update.error) && <p className="text-destructive">{error?.message ?? usersError?.message ?? update.error?.message}</p>}
    {isLoading && <p className="text-muted-foreground">Loading grants...</p>}
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Account" className="min-w-52 max-w-full rounded-md border bg-background px-2 py-1.5" value={userID} onChange={(event) => setUserID(event.target.value)}>
        <option value="">Choose an account</option>
        {accounts.map((user) => <option key={user.id} value={user.id}>{user.username} ({user.id.slice(0, 8)})</option>)}
      </select>
      {userID && <>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={selected?.submit ?? false} disabled={update.isPending || isLoading} onChange={(event) => update.mutate({ user_id: userID, submit: event.target.checked, review: selected?.review ?? false })} /> Submit</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={selected?.review ?? false} disabled={update.isPending || isLoading} onChange={(event) => update.mutate({ user_id: userID, submit: selected?.submit ?? false, review: event.target.checked })} /> Review</label>
      </>}
    </div>
    {granted.length > 0 && <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Current grants</p>
      {granted.map((grant) => <div key={grant.user_id} className="flex flex-wrap items-center gap-2 rounded border px-2 py-1">
        <span className="min-w-36">{accounts.find((user) => user.id === grant.user_id)?.username ?? grant.user_id}</span>
        <span className="text-xs text-muted-foreground">{[grant.submit && "submit", grant.review && "review"].filter(Boolean).join(" · ")}</span>
        <Button type="button" variant="ghost" size="sm" disabled={update.isPending} onClick={() => setUserID(grant.user_id)}>Edit</Button>
        <Button type="button" variant="ghost" size="sm" disabled={update.isPending} onClick={() => update.mutate({ user_id: grant.user_id, submit: false, review: false })}>Revoke</Button>
      </div>)}
    </div>}
  </div>;
}
