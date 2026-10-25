import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Check, ChevronRight, Clock, ImageUp, Maximize2, Search, Users } from "lucide-react";
import { useArmorySearch } from "@/api/queries";
import type { ArmorySearchResult, ProofApplicant, ProofCooldownResponse } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ProofSubject = {
  realm_id: string;
  character_guid: string;
  name: string;
  realm_name: string;
  class?: string;
  guild_name?: string;
  status: string;
  warning?: string;
};

type SelectedProofCharacter = ProofSubject & Pick<ArmorySearchResult, "class" | "guild_name">;

export type ProofRequest = {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  tenant_slug?: string;
  purpose: string;
  status: string;
  message: string;
  response?: string;
  created_at: string;
  reviewed_at?: string;
  subjects: ProofSubject[];
  applicant_id?: string;
  applicant?: ProofApplicant;
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

function useProofCooldown() {
  return useQuery({
    queryKey: ["proof-cooldown"],
    queryFn: async () => {
      const response = await fetch("/api/v1/linked/me/proofs/cooldown", { credentials: "include" });
      if (!response.ok) throw new Error("Could not check proof cooldown");
      return response.json() as Promise<ProofCooldownResponse>;
    },
    staleTime: 30_000,
  });
}

function cooldownText(remainingMs: number) {
  const minutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${minutes}m`;
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

const EXAMPLE_SCREENSHOT = "/c/images/photo-proof-example.webp";

// Remount (via key) to clear the selection.
function ScreenshotDropzone({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  const choose = (next: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : null;
    setPreview(previewRef.current);
    onChange(next);
  };

  return <label
    className={`relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 border-dashed p-4 text-center transition-colors ${dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-muted/40"}`}
    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => {
      event.preventDefault();
      setDragging(false);
      const dropped = event.dataTransfer.files?.[0];
      if (dropped?.type.startsWith("image/")) choose(dropped);
      else toast.error("Drop an image file.");
    }}
  >
    <input type="file" accept="image/*" className="sr-only" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
    {preview ? <>
      <img src={preview} alt="Selected screenshot" className="absolute inset-0 size-full bg-black object-contain" />
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-3 py-1.5 text-xs text-white">{file?.name} · Click to change</span>
    </> : <>
      <ImageUp className="size-8 text-muted-foreground" />
      <span className="text-sm font-medium">Upload your screenshot</span>
      <span className="text-xs text-muted-foreground">Click to browse or drag an image here</span>
    </>}
  </label>;
}

function StepLabel({ step, title, done, htmlFor }: { step: number; title: string; done?: boolean; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="flex items-center gap-2 text-sm font-medium">
    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-green-500/20 text-green-500" : "bg-primary/20 text-primary"}`}>
      {done ? <Check className="size-3.5" /> : step}
    </span>
    <span><span className="text-muted-foreground">Step {step}:</span> {title}</span>
  </label>;
}

function ProofExample() {
  const [expanded, setExpanded] = useState(false);
  return <>
    <button type="button" onClick={() => setExpanded(true)} className="group relative aspect-[4/3] overflow-hidden rounded-lg border text-left">
      <img src={EXAMPLE_SCREENSHOT} alt="Example character selection screenshot" className="size-full object-cover object-right-top transition-transform group-hover:scale-105" />
      <span className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-xs font-medium text-white">Example</span>
      <span className="absolute top-2 right-2 rounded bg-black/70 p-1 text-white opacity-80 group-hover:opacity-100"><Maximize2 className="size-3.5" /></span>
      <span className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-1.5 text-xs text-white">Realm name and every claimed character visible</span>
    </button>
    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent className="max-w-5xl sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Example screenshot</DialogTitle>
          <DialogDescription>Take it on the character selection screen. The realm name (circled) and every character you claim (boxed) must be visible.</DialogDescription>
        </DialogHeader>
        <img src={EXAMPLE_SCREENSHOT} alt="Example character selection screenshot with the realm name circled and the character list boxed" className="max-h-[75vh] w-full rounded object-contain" />
      </DialogContent>
    </Dialog>
  </>;
}

export function PhotoProofCard({ callout }: { callout?: string }) {
  const queryClient = useQueryClient();
  const cooldown = useProofCooldown();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const nextSubmissionAt = cooldown.data?.next_submission_at;
  const remainingMs = Math.max(0, (nextSubmissionAt ? Date.parse(nextSubmissionAt) : 0) - now);
  const cannotSubmit = cooldown.isLoading || cooldown.isError || remainingMs > 0;
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedProofCharacter[]>([]);
  const [message, setMessage] = useState("");
  const { data: search, isFetching } = useArmorySearch({ q: query });
  const submit = useMutation({
    mutationFn: async () => {
      if (!file || selected.length === 0) throw new Error("Choose a screenshot and at least one character");
      const form = new FormData();
      form.append("photo", await encodeScreenshot(file), "character-select.jpg");
      form.append("characters", JSON.stringify(selected.map(({ realm_id, character_guid }) => ({ realm_id, character_guid }))));
      form.append("message", message.trim());
      const response = await fetch("/api/v1/linked/me/proofs", { method: "POST", credentials: "include", body: form });
      if (response.status === 429) {
        const body = await response.json().catch(() => null) as ProofCooldownResponse | null;
        if (body?.next_submission_at) queryClient.setQueryData<ProofCooldownResponse>(["proof-cooldown"], body);
        throw new Error(body?.message ?? "Only one photo proof request is allowed every 24 hours");
      }
      return proofResponse(response);
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
      queryClient.setQueryData<ProofCooldownResponse>(["proof-cooldown"], {
        next_submission_at: new Date(Date.parse(request.created_at) + 24 * 60 * 60_000).toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["proof-cooldown"] });
      queryClient.invalidateQueries({ queryKey: ["my-proofs"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const add = (player: ArmorySearchResult) => {
    if (selected.some((entry) => entry.character_guid === player.id && entry.realm_id === player.realm_id)) return;
    if (selected.length >= 10) { toast.error("Select at most 10 characters per request."); return; }
    if (selected.length && selected[0].realm_id !== player.realm_id) {
      toast.error("All characters must be on the same realm and visible in one screenshot.");
      return;
    }
    setSelected([...selected, { character_guid: player.id, realm_id: player.realm_id, name: player.name, realm_name: player.realm_name, class: player.class, guild_name: player.guild_name, status: "pending" }]);
    setQuery("");
  };

  return (
    <section className="rounded-lg border p-4 space-y-4">
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium"><Camera className="size-4 text-muted-foreground" />Link with photo proof</h3>
        {callout && <p className="text-sm rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-yellow-500">{callout}</p>}
        <p className="text-sm text-muted-foreground">Upload a screenshot of your character selection screen with the realm name and every character you claim visible. An administrator reviews it, and the screenshot is deleted after review.</p>
        {cooldown.isLoading && <p className="text-sm text-muted-foreground">Checking your submission cooldown...</p>}
        {cooldown.isError && <p className="text-sm text-destructive">Could not check your cooldown. Refresh the page to try again.</p>}
        {remainingMs > 0 && nextSubmissionAt && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">Cooldown: {cooldownText(remainingMs)} remaining. You can submit another request after {new Date(nextSubmissionAt).toLocaleString()}.</p>}
        {!open && <Button variant="outline" size="sm" disabled={cannotSubmit} onClick={() => setOpen(true)}>Start a request</Button>}
      </div>
      {open && <div className="space-y-6 border-t pt-4">
      <div className="space-y-2">
        <StepLabel step={1} title="Upload your character selection screenshot" done={!!file} />
        <div className="grid gap-3 sm:grid-cols-2">
          <ScreenshotDropzone key={fileInputKey} file={file} onChange={setFile} />
          <ProofExample />
        </div>
      </div>
      <div className="space-y-2">
        <StepLabel step={2} title="Select every character shown in the screenshot" done={selected.length > 0} htmlFor="proof-character-search" />
        <p className="text-xs text-muted-foreground">One request can claim up to 10 characters on the same realm.</p>
        <div className="relative"><Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" /><Input id="proof-character-search" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the armory by character name" /></div>
        {query.length >= 2 && <div className="max-h-48 overflow-y-auto styled-scrollbar rounded border divide-y">
          {isFetching && <p className="px-3 py-2 text-sm text-muted-foreground">Searching...</p>}
          {search?.players.map((player) => <button type="button" key={`${player.realm_id}-${player.id}`} onClick={() => add(player)} className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-left text-sm hover:bg-muted/50">
            <span className="min-w-0">
              <span className="font-medium" style={{ color: getClassColorVar(player.class) }}>{player.name}</span>
              {player.guild_name && <span className="ml-2 text-xs text-muted-foreground">&lt;{player.guild_name}&gt;</span>}
            </span>
            <span className="text-xs text-muted-foreground">{player.realm_name} · {player.level} {player.class}</span>
          </button>)}
          {!isFetching && search?.players.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No matching characters found.</p>}
        </div>}
        {selected.map((entry) => <div key={`${entry.realm_id}-${entry.character_guid}`} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="font-medium" style={{ color: getClassColorVar(entry.class) }}>{entry.name}</span>
            {entry.guild_name && <span className="ml-2 text-xs text-muted-foreground">&lt;{entry.guild_name}&gt;</span>}
            <span className="ml-2 text-xs text-muted-foreground">· {entry.realm_name}</span>
          </span>
          <button className="shrink-0 text-destructive hover:underline" type="button" onClick={() => setSelected(selected.filter((item) => item !== entry))}>Remove</button>
        </div>)}
      </div>
      <div className="space-y-2">
        <StepLabel step={3} title="Submit for review" htmlFor="proof-message" />
        <textarea id="proof-message" className="w-full min-h-20 rounded-md border bg-background p-2 text-sm" maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Optional message to the reviewer, with any context that helps verify your characters" />
        <div className="flex gap-2">
          <Button disabled={!file || !selected.length || submit.isPending || cannotSubmit} onClick={() => setConfirming(true)}>{submit.isPending ? "Preparing screenshot..." : "Submit proof"}</Button>
          <Button variant="ghost" disabled={submit.isPending} onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </div>
      </div>}
      <Dialog open={confirming} onOpenChange={(next) => !submit.isPending && setConfirming(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit photo proof?</DialogTitle>
            <DialogDescription>Double-check your request before sending it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="flex gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-yellow-500">
              <Clock className="mt-0.5 size-4 shrink-0" />
              You can only submit one photo proof request every 24 hours.
            </p>
            <p className="flex gap-2 text-muted-foreground">
              <Users className="mt-0.5 size-4 shrink-0" />
              Have more characters on this realm? Add them all to this request instead of sending another one.
            </p>
            <div className="rounded-md border">
              <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">Claiming {selected.length} character{selected.length === 1 ? "" : "s"}</p>
              <ul className="max-h-40 divide-y overflow-y-auto styled-scrollbar">
                {selected.map((entry) => <li key={`${entry.realm_id}-${entry.character_guid}`} className="px-3 py-1.5">
                  <span className="font-medium" style={{ color: getClassColorVar(entry.class) }}>{entry.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{entry.realm_name}</span>
                </li>)}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={submit.isPending} onClick={() => setConfirming(false)}>Add more characters</Button>
            <Button disabled={submit.isPending} onClick={() => submit.mutate(undefined, { onSettled: () => setConfirming(false) })}>
              {submit.isPending ? "Preparing screenshot..." : "Submit proof"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const { data: history } = useMyProofs();
  const [expanded, setExpanded] = useState(false);
  if (!history?.length) return null;
  const pendingCount = history.filter((request) => request.status === "pending").length;
  return <div className="space-y-2">
    <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ChevronRight className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
      Your photo proof requests ({history.length})
      {pendingCount > 0 && <ProofStatus status="pending" />}
    </button>
    {expanded && <div className="divide-y rounded-lg border">
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
