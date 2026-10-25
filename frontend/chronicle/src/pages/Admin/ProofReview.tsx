import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Check, ChevronLeft, ChevronRight, Server, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProofRequest } from "@/pages/Settings/PhotoProof";
import { getClassColorVar } from "@/pages/ArmoryPage/types";

type Draft = { choices: Record<string, boolean>; message: string };
const EMPTY_DRAFT: Draft = { choices: {}, message: "" };

const subjectKey = (subject: { realm_id: string; character_guid: string }) => `${subject.realm_id}/${subject.character_guid}`;

function TenantBadge({ request, large = false }: { request: ProofRequest; large?: boolean }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 font-medium text-primary", large ? "px-3 py-1 text-base" : "px-2 py-0.5 text-sm")} title={`Tenant ${request.tenant_id}`}>
    <Server className={large ? "size-4" : "size-3.5"} />
    {request.tenant_name || request.tenant_id}
    {request.tenant_slug && <span className="font-normal text-primary/70">({request.tenant_slug})</span>}
  </span>;
}

function ApplicantPanel({ request }: { request: ProofRequest }) {
  const applicant = request.applicant;
  return <div className="rounded border p-3 space-y-3 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <User className="size-4 text-muted-foreground" />
      <span className="font-semibold">{applicant?.username ?? "Unknown user"}</span>
      {applicant && (applicant.discord_linked
        ? <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-400" title={applicant.discord_id ? `Discord ID ${applicant.discord_id}` : undefined}>Discord user</span>
        : <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">No Discord account</span>)}
    </div>
    <p className="text-xs text-muted-foreground">
      User ID <code>{request.applicant_id}</code>
      {applicant?.discord_id && <> · Discord ID <code>{applicant.discord_id}</code></>}
    </p>
    {applicant && <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><BadgeCheck className="size-3.5" />Already linked ({applicant.linked_characters.length})</p>
      {applicant.linked_characters.length === 0
        ? <p className="text-xs text-muted-foreground">No linked characters yet.</p>
        : <ul className="max-h-32 space-y-0.5 overflow-y-auto styled-scrollbar">
          {applicant.linked_characters.map((character) => <li key={character.link_id} className="text-xs">
            <Link to={`/armory/${encodeURIComponent(character.realm_name)}/${character.character_guid}`} target="_blank" className="font-medium hover:underline" style={{ color: getClassColorVar(character.class) }}>{character.name}</Link>
            <span className="text-muted-foreground"> · {character.level} {character.class} · {character.realm_name}{character.is_primary ? " · Primary" : ""}</span>
          </li>)}
        </ul>}
    </div>}
  </div>;
}

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
  if (!url) return <div className="flex aspect-[4/3] items-center justify-center rounded border bg-black/40 text-sm text-muted-foreground">Loading evidence...</div>;
  return <a href={url} target="_blank" rel="noreferrer" title="Open full-size screenshot"><img src={url} onLoad={onAvailable} alt="Applicant's character selection screenshot" className="max-h-[70vh] w-full rounded border object-contain bg-black" /></a>;
}

function Review({ request, draft, onDraftChange }: { request: ProofRequest; draft: Draft; onDraftChange: (draft: Draft) => void }) {
  const queryClient = useQueryClient();
  const [evidenceAvailable, setEvidenceAvailable] = useState(false);
  const { choices, message } = draft;
  const setChoice = (key: string, approved: boolean) => onDraftChange({ ...draft, choices: { ...choices, [key]: approved } });
  const setAll = (approved: boolean) => onDraftChange({ ...draft, choices: Object.fromEntries(request.subjects.map((subject) => [subjectKey(subject), approved])) });
  const decide = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/linked/admin/proofs/${encodeURIComponent(request.id)}/decision`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), decisions: request.subjects.map((subject) => ({ realm_id: subject.realm_id, character_guid: subject.character_guid, approved: choices[subjectKey(subject)] })) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Review failed (${response.status})`);
      }
    },
    onSuccess: () => { toast.success("Decision saved"); queryClient.invalidateQueries({ queryKey: ["admin-proofs"] }); },
    onError: (error) => toast.error(error.message),
  });
  const undecided = request.subjects.filter((subject) => choices[subjectKey(subject)] === undefined).length;

  return <article className="rounded-lg border">
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/30 px-4 py-3 text-sm">
      <span className="text-muted-foreground">Submitted to</span>
      <TenantBadge request={request} large />
      <span className="text-muted-foreground">{new Date(request.created_at).toLocaleString()}</span>
      <span className="ml-auto text-xs text-muted-foreground">Request {request.id.slice(0, 8)}</span>
    </header>
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
      <Evidence id={request.id} onAvailable={() => setEvidenceAvailable(true)} />
      <div className="space-y-4">
        <ApplicantPanel request={request} />
        {request.message && <div className="rounded bg-muted/50 p-3 text-sm whitespace-pre-wrap"><span className="block text-xs text-muted-foreground">Applicant message</span>{request.message}</div>}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Characters ({request.subjects.length})</h3>
            {request.subjects.length > 1 && <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setAll(true)}>Approve all</Button>
              <Button size="sm" variant="ghost" onClick={() => setAll(false)}>Deny all</Button>
            </div>}
          </div>
          <p className="text-xs text-muted-foreground">Check the realm and each name against the screenshot. Existing links cannot be reassigned by this review.</p>
          {request.subjects.map((subject) => {
            const key = subjectKey(subject);
            const choice = choices[key];
            return <div key={key} className={cn("rounded border p-3 space-y-2 text-sm", choice === true && "border-green-500/50 bg-green-500/5", choice === false && "border-destructive/50 bg-destructive/5")}>
              <Link className="font-medium hover:underline" to={`/armory/${encodeURIComponent(subject.realm_name)}/${subject.character_guid}`} target="_blank">
                <span style={subject.class ? { color: getClassColorVar(subject.class) } : undefined}>{subject.name}</span> <span className="text-muted-foreground">· {subject.realm_name}</span>
              </Link>
              {subject.warning && <p className="text-amber-500">{subject.warning}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant={choice === true ? "default" : "outline"} className={cn(choice === true && "bg-green-600 hover:bg-green-600/90 text-white")} onClick={() => setChoice(key, true)}><Check className="size-3.5" />Approve</Button>
                <Button size="sm" variant={choice === false ? "destructive" : "outline"} onClick={() => setChoice(key, false)}><X className="size-3.5" />Deny</Button>
              </div>
            </div>;
          })}
        </div>
        <label className="block text-sm space-y-1"><span>Response to applicant</span><textarea className="w-full min-h-20 rounded-md border bg-background p-2" maxLength={2000} value={message} onChange={(event) => onDraftChange({ ...draft, message: event.target.value })} placeholder="Explain approvals or denials" /></label>
        <div className="flex items-center gap-3">
          <Button disabled={!evidenceAvailable || decide.isPending || undecided > 0} onClick={() => decide.mutate()}>{decide.isPending ? "Saving..." : "Save decision"}</Button>
          {undecided > 0 && <span className="text-xs text-muted-foreground">{undecided} character{undecided === 1 ? "" : "s"} still need a decision</span>}
        </div>
      </div>
    </div>
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
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  // Saving a decision drops the request from the pending list; clamp so the
  // next request slides into place.
  const current = pending.length ? Math.min(index, pending.length - 1) : 0;
  const request = pending[current];
  const go = (delta: number) => setIndex(Math.max(0, Math.min(pending.length - 1, current + delta)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, Math.min(i, pending.length - 1) - 1));
      if (event.key === "ArrowRight") setIndex((i) => Math.min(pending.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending.length]);

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Photo proof review <span className="text-muted-foreground font-normal">({pending.length} pending)</span></h2>
      {pending.length > 0 && <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={current === 0} onClick={() => go(-1)} aria-label="Previous request"><ChevronLeft className="size-4" />Prev</Button>
        <span className="min-w-20 text-center text-sm tabular-nums">{current + 1} of {pending.length}</span>
        <Button size="sm" variant="outline" disabled={current >= pending.length - 1} onClick={() => go(1)} aria-label="Next request">Next<ChevronRight className="size-4" /></Button>
      </div>}
    </div>
    {pending.length > 1 && <p className="text-xs text-muted-foreground">Use ← and → to flip between requests. Unsaved decisions are kept while you flip.</p>}
    {isLoading && <p className="text-sm text-muted-foreground">Loading requests...</p>}
    {error && <p className="text-sm text-destructive">{error.message}</p>}
    {pending.length === 0 && !isLoading && !error && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No requests awaiting review.</p>}
    {request && <Review
      key={request.id}
      request={request}
      draft={drafts[request.id] ?? EMPTY_DRAFT}
      onDraftChange={(draft) => setDrafts((all) => ({ ...all, [request.id]: draft }))}
    />}
    {!!data?.some((r) => r.status !== "pending") && <div className="border-t pt-4 space-y-2">
      <h3 className="text-sm font-medium">Recent decisions</h3>
      {data.filter((r) => r.status !== "pending").slice(0, 10).map((r) => <div key={r.id} className="rounded border p-3 text-sm space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium capitalize">{r.status}</span>
          <TenantBadge request={r} />
          <span className="text-muted-foreground">{new Date(r.reviewed_at ?? r.created_at).toLocaleString()} · {r.applicant?.username ?? r.applicant_id}</span>
        </div>
        <p className="text-muted-foreground">{r.subjects.map((subject, i) => <span key={subjectKey(subject)}>
          {i > 0 && ", "}<span style={subject.class ? { color: getClassColorVar(subject.class) } : undefined}>{subject.name}</span>: {subject.status}
        </span>)}</p>
        {r.response && <p>Response: {r.response}</p>}
      </div>)}
    </div>}
  </section>;
}
