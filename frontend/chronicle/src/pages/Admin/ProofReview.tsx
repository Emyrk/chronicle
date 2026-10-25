import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ProofRequest } from "@/pages/Settings/PhotoProof";
import { getClassColorVar } from "@/pages/ArmoryPage/types";

function Evidence({ id, onAvailable }: { id: string; onAvailable: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    fetch(`/api/v1/linked/admin/proofs/${encodeURIComponent(id)}/image`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Image unavailable");
        const image = await response.blob();
        if (active) {
          objectUrl = URL.createObjectURL(image);
          setUrl(objectUrl);
        }
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  if (error) return <p className="text-sm text-destructive">Evidence unavailable. Do not approve without reviewing it.</p>;
  if (!url) return <p className="text-sm text-muted-foreground">Loading evidence...</p>;
  return <a href={url} target="_blank" rel="noreferrer" title="Open full-size screenshot"><img src={url} onLoad={onAvailable} alt="Applicant's character selection screenshot" className="max-h-[32rem] w-full rounded border object-contain bg-black" /></a>;
}

function Review({ request }: { request: ProofRequest }) {
  const queryClient = useQueryClient();
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [evidenceAvailable, setEvidenceAvailable] = useState(false);
  const key = (subject: { realm_id: string; character_guid: string }) => `${subject.realm_id}/${subject.character_guid}`;
  const decide = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/linked/admin/proofs/${encodeURIComponent(request.id)}/decision`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), decisions: request.subjects.map((subject) => ({ realm_id: subject.realm_id, character_guid: subject.character_guid, approved: choices[key(subject)] })) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Review failed (${response.status})`);
      }
    },
    onSuccess: () => { toast.success("Decision saved"); queryClient.invalidateQueries({ queryKey: ["admin-proofs"] }); },
    onError: (error) => toast.error(error.message),
  });
  return <article className="rounded-lg border p-4 space-y-4">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">Request {request.id.slice(0, 8)}</h3><span className="text-sm text-muted-foreground">{new Date(request.created_at).toLocaleString()}</span></div>
    <p className="text-sm text-muted-foreground">Tenant: {request.tenant_id} · Applicant ID: {request.applicant_id}</p>
    {request.message && <p className="rounded bg-muted/50 p-3 text-sm whitespace-pre-wrap">Applicant: {request.message}</p>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
      <Evidence id={request.id} onAvailable={() => setEvidenceAvailable(true)} />
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Check the realm and each name against the screenshot. Existing links cannot be reassigned by this review.</p>
        {request.subjects.map((subject) => <div key={key(subject)} className="rounded border p-3 space-y-2 text-sm">
          <Link className="font-medium hover:underline" to={`/armory/${encodeURIComponent(subject.realm_name)}/${subject.character_guid}`} target="_blank">
            <span style={subject.class ? { color: getClassColorVar(subject.class) } : undefined}>{subject.name}</span> · {subject.realm_name}
          </Link>
          {subject.warning && <p className="text-amber-500">{subject.warning}</p>}
          <div className="flex gap-4">
            <label className="flex gap-1 items-center"><input type="radio" name={`${request.id}/${key(subject)}`} checked={choices[key(subject)] === true} onChange={() => setChoices({ ...choices, [key(subject)]: true })} /> Approve</label>
            <label className="flex gap-1 items-center"><input type="radio" name={`${request.id}/${key(subject)}`} checked={choices[key(subject)] === false} onChange={() => setChoices({ ...choices, [key(subject)]: false })} /> Deny</label>
          </div>
        </div>)}
      </div>
    </div>
    <label className="block text-sm space-y-1"><span>Response to applicant</span><textarea className="w-full min-h-20 rounded-md border bg-background p-2" maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Explain approvals or denials" /></label>
    <Button disabled={!evidenceAvailable || decide.isPending || request.subjects.some((subject) => choices[key(subject)] === undefined)} onClick={() => decide.mutate()}>{decide.isPending ? "Saving..." : "Save decision"}</Button>
  </article>;
}

export function ProofReview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-proofs"],
    queryFn: async () => {
      const response = await fetch("/api/v1/linked/admin/proofs", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load proof requests");
      return response.json() as Promise<ProofRequest[]>;
    },
  });
  const pending = data?.filter((request) => request.status === "pending") ?? [];
  return <section className="space-y-3"><h2 className="text-lg font-semibold">Photo proof review <span className="text-muted-foreground font-normal">({pending.length} pending)</span></h2>
    {isLoading && <p className="text-sm text-muted-foreground">Loading requests...</p>}
    {error && <p className="text-sm text-destructive">{error.message}</p>}
    {pending.length === 0 && !isLoading && !error && <p className="text-sm text-muted-foreground">No requests awaiting review.</p>}
    {pending.map((request) => <Review key={request.id} request={request} />)}
    {!!data?.some((request) => request.status !== "pending") && <div className="border-t pt-4 space-y-2">
      <h3 className="text-sm font-medium">Recent decisions</h3>
      {data.filter((request) => request.status !== "pending").slice(0, 10).map((request) => <div key={request.id} className="rounded border p-3 text-sm">
        <span className="font-medium capitalize">{request.status}</span> · Tenant {request.tenant_id} · {request.applicant_id} · {new Date(request.reviewed_at ?? request.created_at).toLocaleString()}
        <p className="text-muted-foreground">{request.subjects.map((subject, index) => <span key={`${subject.realm_id}/${subject.character_guid}`}>
          {index > 0 && ", "}<span style={subject.class ? { color: getClassColorVar(subject.class) } : undefined}>{subject.name}</span>: {subject.status}
        </span>)}</p>
        {request.response && <p>Response: {request.response}</p>}
      </div>)}
    </div>}
  </section>;
}
