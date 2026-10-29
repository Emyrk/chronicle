import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, Crown, Link2, Lock, Maximize2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { GuildInfo, GuildRosterCharacter, ProofCooldownResponse } from "@/api/typesGenerated";
import { useGuildCharacters, useMyCharacters } from "@/api/queries";
import { ProofScreenshotDropzone } from "@/components/ProofScreenshotDropzone";
import { encodeProofScreenshot } from "@/lib/proofScreenshot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import type { ProofRequest } from "@/pages/Settings/PhotoProof";
import { getClassColorVar } from "@/pages/ArmoryPage/types";

const GUILD_PROOF_PURPOSE = "guild-ownership";
const EXAMPLE_SCREENSHOT = "/c/images/guild-claim-example.webp";

function GuildClaimExample() {
  const [expanded, setExpanded] = useState(false);
  return <>
    <button type="button" onClick={() => setExpanded(true)} className="group relative aspect-[2/1] w-full overflow-hidden rounded-lg border text-left">
      <img src={EXAMPLE_SCREENSHOT} alt="Example guild claim screenshot" className="size-full object-cover object-left-top transition-transform group-hover:scale-105" />
      <span className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-xs font-medium text-white">Example</span>
      <span className="absolute top-2 right-2 rounded bg-black/70 p-1 text-white opacity-80 group-hover:opacity-100"><Maximize2 className="size-3.5" /></span>
      <span className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-1.5 text-xs text-white">Guild roster, guild ranks, and your character panel</span>
    </button>
    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent className="max-w-5xl sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Example screenshot</DialogTitle>
          <DialogDescription>Open the guild roster, the guild rank list, and your character panel in one screenshot. Your character must hold the top rank.</DialogDescription>
        </DialogHeader>
        <img src={EXAMPLE_SCREENSHOT} alt="Example screenshot showing the guild roster, guild ranks, and character panel" className="max-h-[75vh] w-full rounded object-contain" />
      </DialogContent>
    </Dialog>
  </>;
}

function CharacterPicker({ members, linked, selected, onSelect }: {
  members: readonly GuildRosterCharacter[];
  linked: Set<string>;
  selected: GuildRosterCharacter | null;
  onSelect: (member: GuildRosterCharacter) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = members
    .filter((member) => member.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(linked.has(b.id)) - Number(linked.has(a.id)) || a.name.localeCompare(b.name));
  return <div className="space-y-2">
    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this guild's characters..." />
    <div className="max-h-48 divide-y overflow-y-auto rounded-md border styled-scrollbar">
      {filtered.length === 0 && <p className="p-3 text-sm text-muted-foreground">No matching characters.</p>}
      {filtered.map((member) => <button
        key={member.id}
        type="button"
        onClick={() => onSelect(member)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/60 ${selected?.id === member.id ? "bg-amber-500/10" : ""}`}
      >
        <span className="font-medium" style={{ color: getClassColorVar(member.class) }}>{member.name}</span>
        <span className="text-xs text-muted-foreground">{member.level} {member.class}</span>
        {linked.has(member.id) && <span className="ml-auto flex items-center gap-1 text-xs text-green-500"><BadgeCheck className="h-3.5 w-3.5" />Linked</span>}
      </button>)}
    </div>
  </div>;
}

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

// GuildClaimLockedButton is shown to signed-in users who could claim an
// unclaimed guild but lack the claim permission.
export function GuildClaimLockedButton() {
  return <HintTooltip delayDuration={150}>
    <TooltipTrigger asChild>
      {/* Disabled buttons swallow pointer events, so the span hosts the tooltip. */}
      <span tabIndex={0} className="inline-flex">
        <Button size="sm" disabled className="pointer-events-none border border-amber-300/30 bg-amber-500/90 text-black shadow-sm">
          <Lock className="h-4 w-4" />
          Claim this guild
        </Button>
      </span>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="max-w-64 text-center">
      You must be Honored or above to claim a guild, and you must be its guild master.
    </TooltipContent>
  </HintTooltip>;
}

export function GuildClaimDialog({ guild }: { guild: GuildInfo }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [character, setCharacter] = useState<GuildRosterCharacter | null>(null);
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

  const roster = useGuildCharacters(open ? guild.id : undefined);
  const myCharacters = useMyCharacters({ enabled: open });
  const linked = useMemo(() => new Set((myCharacters.data ?? [])
    .filter((link) => link.realm_id === guild.realm_id)
    .map((link) => link.character_guid)), [myCharacters.data, guild.realm_id]);
  const characterLinked = !!character && linked.has(character.id);

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
      if (!character || !characterLinked) throw new Error("Select your linked guild master character");
      if (!file) throw new Error("Choose a screenshot that proves you lead this guild");
      const form = new FormData();
      form.append("guild_id", guild.id);
      form.append("character_guid", character.id);
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
      setCharacter(null);
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
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">1. Choose your guild master character</h3>
            <p className="text-sm text-muted-foreground">Pick the character that leads &lt;{guild.name}&gt;. It must already be linked to your Chronicle account.</p>
            {roster.isLoading || myCharacters.isLoading
              ? <p className="text-sm text-muted-foreground">Loading guild characters...</p>
              : roster.isError || myCharacters.isError
                ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">Could not load characters. Refresh the page to try again.</p>
                : <CharacterPicker members={roster.data?.members ?? []} linked={linked} selected={character} onSelect={setCharacter} />}
            {character && !characterLinked && <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
              <span className="flex-1">{character.name} is not linked to your account. Link it first, then come back to claim this guild.</span>
              <Button size="sm" variant="outline" onClick={() => navigate("/account/characters")}>
                <Link2 className="h-4 w-4" />
                Link {character.name}
              </Button>
            </div>}
          </div>

          <h3 className="text-sm font-semibold">2. Upload a screenshot</h3>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-500">
              <Crown className="h-4 w-4" /> What the screenshot must show
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>The in-game guild roster with <span className="font-medium text-foreground">{guild.name}</span> clearly visible.</li>
              <li>{character && characterLinked ? <span className="font-medium text-foreground">{character.name}</span> : "Your character"} identified as guild leader, guild master, or the highest leadership rank.</li>
              <li>The guild rank list and your character panel open, so the reviewer can match the character to the top rank.</li>
              <li>The realm or server name <span className="font-medium text-foreground">{guild.realm_name}</span>, visible in the same screenshot when possible.</li>
            </ul>
            <div className="mt-3"><GuildClaimExample /></div>
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
          <Button disabled={!file || !characterLinked || cannotSubmit || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Preparing screenshot..." : "Submit guild claim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
