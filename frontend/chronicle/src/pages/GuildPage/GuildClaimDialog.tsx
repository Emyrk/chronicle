import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Crown, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { GuildInfo, ProofCooldownResponse } from "@/api/typesGenerated";
import { ProofScreenshotDropzone } from "@/components/ProofScreenshotDropzone";
import { encodeProofScreenshot } from "@/lib/proofScreenshot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProofRequest } from "@/pages/Settings/PhotoProof";

const GUILD_PROOF_PURPOSE = "guild-ownership";

function cooldownText(remainingMs: number) {
  const minutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${minutes}m`;
}

function requestError(response: Response, fallback: string) {
  return response.json()
    .catch(() => null)
    .then((body) => new Error(body?.message ?? `${fallback} (${response.status})`));
}

export function GuildClaimDialog({ guild }: { guild: GuildInfo }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const proofs = useQuery({
    queryKey: ["my-proofs"],
    queryFn: async () => {
      const response = await fetch("/api/v1/linked/me/proofs", { credentials: "include" });
      if (!response.ok) throw await requestError(response, "Could not load your claims");
      return response.json() as Promise<ProofRequest[]>;
    },
  });
  const cooldown = useQuery({
    queryKey: ["guild-proof-cooldown"],
    queryFn: async () => {
      const response = await fetch("/api/v1/linked/me/guild-proofs/cooldown", { credentials: "include" });
      if (!response.ok) throw await requestError(response, "Could not check claim cooldown");
      return response.json() as Promise<ProofCooldownResponse>;
    },
    staleTime: 30_000,
  });

  const pendingClaim = proofs.data?.find((request) =>
    request.purpose === GUILD_PROOF_PURPOSE &&
    request.status === "pending" &&
    request.subjects.some((subject) => subject.guild_id === guild.id),
  );
  const nextSubmissionAt = cooldown.data?.next_submission_at;
  const remainingMs = Math.max(0, (nextSubmissionAt ? Date.parse(nextSubmissionAt) : 0) - now);
  const cannotSubmit = cooldown.isLoading || cooldown.isError || remainingMs > 0;

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a screenshot that proves you lead this guild");
      const form = new FormData();
      form.append("guild_id", guild.id);
      form.append("photo", await encodeProofScreenshot(file), "guild-roster.jpg");
      form.append("message", message.trim());
      const response = await fetch("/api/v1/linked/me/guild-proofs", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as ProofCooldownResponse | null;
        if (response.status === 429 && body?.next_submission_at) {
          queryClient.setQueryData<ProofCooldownResponse>(["guild-proof-cooldown"], body);
        }
        throw new Error(body?.message ?? `Could not submit guild claim (${response.status})`);
      }
      return response.json() as Promise<ProofRequest>;
    },
    onSuccess: (request) => {
      toast.success(`Claim for ${guild.name} submitted for review`);
      queryClient.setQueryData<ProofRequest[]>(["my-proofs"], (current = []) => [request, ...current]);
      queryClient.setQueryData<ProofCooldownResponse>(["guild-proof-cooldown"], {
        next_submission_at: new Date(Date.parse(request.created_at) + 24 * 60 * 60_000).toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["my-proofs"] });
      queryClient.invalidateQueries({ queryKey: ["guild-proof-cooldown"] });
      setFile(null);
      setFileInputKey((key) => key + 1);
      setMessage("");
      setOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  if (pendingClaim) {
    return <Button variant="outline" size="sm" disabled className="border-amber-500/40 bg-amber-500/10 text-amber-500 opacity-100">
      <Clock className="h-4 w-4" />
      Claim pending
    </Button>;
  }

  return <>
    <Button
      size="sm"
      onClick={() => setOpen(true)}
      disabled={proofs.isLoading}
      className="border border-amber-300/30 bg-amber-500/90 text-black shadow-sm hover:bg-amber-400"
    >
      <Crown className="h-4 w-4" />
      {proofs.isLoading ? "Checking claim..." : "Claim this guild"}
    </Button>
    <Dialog open={open} onOpenChange={(next) => !submit.isPending && setOpen(next)}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto styled-scrollbar">
        <DialogHeader className="pr-8">
          <div className="mb-1 flex items-center gap-2 text-amber-500">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">Guild ownership</span>
          </div>
          <DialogTitle>Claim {guild.name}</DialogTitle>
          <DialogDescription>
            Prove that you lead &lt;{guild.name}&gt; on {guild.realm_name}. After approval, you can manage this guild page and its Chronicle roster.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-500">
              <Crown className="h-4 w-4" /> What the screenshot must show
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>The in-game guild roster with <span className="font-medium text-foreground">{guild.name}</span> clearly visible.</li>
              <li>Your character identified as guild leader, guild master, or the highest leadership rank.</li>
              <li>The realm or server name <span className="font-medium text-foreground">{guild.realm_name}</span>, visible in the same screenshot when possible.</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Use an uncropped screenshot with enough interface context for an administrator to verify it. The image is deleted after review.</p>
          </div>

          <ProofScreenshotDropzone
            key={fileInputKey}
            file={file}
            onChange={setFile}
            title="Upload guild roster evidence"
            description="Click to browse or drag a screenshot here"
          />

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Message to the reviewer <span className="font-normal text-muted-foreground">(optional)</span></span>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background p-2.5 text-sm"
              maxLength={2000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us your character name, leadership rank, or where to look in the screenshot."
            />
            <span className="block text-right text-xs text-muted-foreground">{message.length}/2000</span>
          </label>

          {cooldown.isLoading && <p className="text-sm text-muted-foreground">Checking your guild-claim cooldown...</p>}
          {cooldown.isError && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">Could not check your cooldown. Refresh the page to try again.</p>}
          {remainingMs > 0 && nextSubmissionAt && <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{cooldown.data?.message ?? "Only one guild claim is allowed every 24 hours."} Try again in {cooldownText(remainingMs)}, after {new Date(nextSubmissionAt).toLocaleString()}.</span>
          </p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={submit.isPending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!file || cannotSubmit || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Preparing screenshot..." : "Submit guild claim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
