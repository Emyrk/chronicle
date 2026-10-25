import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Search } from "lucide-react";
import { useArmorySearch } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ProofSubject = {
  realm_id: string;
  character_guid: string;
  name: string;
  realm_name: string;
  status: string;
  warning?: string;
};

export type ProofRequest = {
  id: string;
  tenant_id: string;
  purpose: string;
  status: string;
  message: string;
  response?: string;
  created_at: string;
  reviewed_at?: string;
  subjects: ProofSubject[];
  applicant_id?: string;
};

async function proofResponse(response: Response): Promise<ProofRequest> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<ProofRequest>;
}

function useMyProofs() {
  return useQuery({
    queryKey: ["my-proofs"],
    queryFn: async () => {
      const response = await fetch("/api/v1/linked/me/proofs", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load proof requests");
      return response.json() as Promise<ProofRequest[]>;
    },
  });
}

// The browser handles source formats (PNG, WebP, HEIC where supported). Never
// upload the original: remove its metadata and bound the encoded JPEG size.
async function encodeScreenshot(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    let scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image conversion is unavailable in this browser");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = attempt < 2 ? 0.86 - attempt * 0.14 : 0.72;
      const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (result && result.size <= 4 * 1024 * 1024) return result;
      scale *= 0.8;
    }
    throw new Error("Screenshot is too large to upload. Try a smaller image.");
  } finally {
    bitmap.close();
  }
}

export function PhotoProofCard({ callout }: { callout?: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProofSubject[]>([]);
  const [message, setMessage] = useState("");
  const { data: search, isFetching } = useArmorySearch({ q: query });
  const submit = useMutation({
    mutationFn: async () => {
      if (!file || selected.length === 0) throw new Error("Choose a screenshot and at least one character");
      const form = new FormData();
      form.append("photo", await encodeScreenshot(file), "character-select.jpg");
      form.append("characters", JSON.stringify(selected.map(({ realm_id, character_guid }) => ({ realm_id, character_guid }))));
      form.append("message", message.trim());
      return proofResponse(await fetch("/api/v1/linked/me/proofs", { method: "POST", credentials: "include", body: form }));
    },
    onSuccess: (request) => {
      toast.success("Proof submitted for review");
      const warnings = request.subjects.filter((subject) => subject.warning);
      if (warnings.length) toast.warning(`${warnings.map((subject) => subject.name).join(", ")} may already be linked. The reviewer will assess these individually.`);
      setFile(null);
      setFileInputKey((key) => key + 1);
      setSelected([]);
      setMessage("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["my-proofs"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const add = (player: { id: string; realm_id: string; name: string; realm_name: string }) => {
    if (selected.some((entry) => entry.character_guid === player.id && entry.realm_id === player.realm_id)) return;
    if (selected.length >= 10) { toast.error("Select at most 10 characters per request."); return; }
    if (selected.length && selected[0].realm_id !== player.realm_id) {
      toast.error("All characters must be on the same realm and visible in one screenshot.");
      return;
    }
    setSelected([...selected, { character_guid: player.id, realm_id: player.realm_id, name: player.name, realm_name: player.realm_name, status: "pending" }]);
    setQuery("");
  };

  return (
    <section className="rounded-lg border p-4 space-y-4">
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium"><Camera className="size-4 text-muted-foreground" />Link with photo proof</h3>
        {callout && <p className="text-sm rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-yellow-500">{callout}</p>}
        <p className="text-sm text-muted-foreground">Upload a screenshot of your character selection screen with the realm name and every character you claim visible. An administrator reviews it, and the screenshot is deleted after review.</p>
        {!open && <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Start a request</Button>}
      </div>
      {open && <div className="space-y-4 border-t pt-4">
      <label className="block text-sm space-y-1">
        <span>Character selection screenshot</span>
        <Input key={fileInputKey} type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="proof-character-search">Select characters</label>
        <div className="relative"><Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" /><Input id="proof-character-search" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the armory by character name" /></div>
        {query.length >= 2 && <div className="max-h-48 overflow-y-auto styled-scrollbar rounded border divide-y">
          {isFetching && <p className="px-3 py-2 text-sm text-muted-foreground">Searching...</p>}
          {search?.players.map((player) => <button type="button" key={`${player.realm_id}-${player.id}`} onClick={() => add(player)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted/50"><span>{player.name}</span><span className="text-muted-foreground">{player.realm_name} · {player.level} {player.class}</span></button>)}
          {!isFetching && search?.players.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No matching characters found.</p>}
        </div>}
        {selected.map((entry) => <div key={`${entry.realm_id}-${entry.character_guid}`} className="flex items-center justify-between rounded border px-3 py-2 text-sm"><span>{entry.name} · {entry.realm_name}</span><button className="text-destructive hover:underline" type="button" onClick={() => setSelected(selected.filter((item) => item !== entry))}>Remove</button></div>)}
      </div>
      <label className="block text-sm space-y-1"><span>Message to reviewer (optional)</span><textarea className="w-full min-h-20 rounded-md border bg-background p-2" maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Any context that helps verify your characters" /></label>
      <div className="flex gap-2">
        <Button disabled={!file || !selected.length || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Preparing screenshot..." : "Submit proof"}</Button>
        <Button variant="ghost" disabled={submit.isPending} onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      </div>}
    </section>
  );
}

const PROOF_STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-500",
  approved: "bg-green-500/15 text-green-500",
  partial: "bg-blue-500/15 text-blue-400",
  rejected: "bg-destructive/15 text-destructive",
};

function ProofStatus({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PROOF_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}`}>{status.replaceAll("_", " ")}</span>;
}

export function PhotoProofHistory() {
  const { data: history, isLoading, error } = useMyProofs();
  if (!isLoading && !error && !history?.length) return null;
  return <div className="space-y-2">
    <h4 className="text-sm font-medium">Your photo proof requests</h4>
    {isLoading && <p className="text-sm text-muted-foreground">Loading requests...</p>}
    {error && <p className="text-sm text-destructive">Could not load request history.</p>}
    {!!history?.length && <div className="divide-y rounded-lg border">
      {history.map((request) => <div key={request.id} className="px-4 py-3 text-sm space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Submitted {new Date(request.created_at).toLocaleDateString()}</span>
          <ProofStatus status={request.status} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {request.subjects.map((subject) => <span key={`${subject.realm_id}-${subject.character_guid}`} className="inline-flex items-center gap-1.5">
            <Link className="font-medium hover:underline" to={`/armory/${encodeURIComponent(subject.realm_name)}/${subject.character_guid}`}>{subject.name}</Link>
            {subject.status !== request.status && <ProofStatus status={subject.status} />}
            {subject.warning && <span className="text-xs text-yellow-500">{subject.warning}</span>}
          </span>)}
        </div>
        {request.message && <p className="text-xs text-muted-foreground">Your message: {request.message}</p>}
        {request.response && <p className="text-xs text-muted-foreground">Reviewer: {request.response}</p>}
      </div>)}
    </div>}
  </div>;
}
