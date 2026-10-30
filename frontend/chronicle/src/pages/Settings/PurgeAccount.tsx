import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Loader2, LogIn, Trash2, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccountPurgeInventory, useAccountPurgeStatus, useSession, useStartAccountPurge } from "@/api/queries";
import { AccountPurgeConfirmation, type AccountDataCount, type AccountPurgeStatus } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import { clearInstanceDefaultsCache } from "@/hooks/useInstanceDefaultsCache";
import { cn } from "@/lib/utils";

const DATA_GROUPS: Record<string, { title: string; description: string }> = {
  logs: {
    title: "Uploaded logs",
    description: "Every raid you uploaded is deleted for everyone in it, along with its rankings and parses. Files you added to someone else's log stay with their log.",
  },
  characters: { title: "Linked characters", description: "Your character claims and verifications." },
  gear: { title: "Gear, builds & compositions", description: "Gear lists, progressions, stat weights, talent builds, and raid compositions." },
  layouts: { title: "Layouts & panels", description: "Panel layouts, tracked layouts, action bars, and custom panel settings." },
  favorites: { title: "Favorites", description: "Your favorite guilds and players." },
  ai: { title: "AI assistant", description: "AI provider connections, chats, and settings." },
  sidekick: { title: "Sidekick", description: "Sidekick installs and settings. Installed copies stop uploading." },
  modules: { title: "Modules", description: "Modules you published are removed for everyone who uses them, along with your author profile, contributor seats, and stars." },
  community: {
    title: "Guilds & community",
    description: "Guild Discord bots you installed are removed, plus your join requests and server applications. Servers and realms you created stay. Shared views stay but are no longer credited to you.",
  },
  billing: { title: "Bonus storage & proofs", description: "Bonus storage grants and photo proof requests." },
};

const PURGE_STEPS = [
  { key: "logs", label: "Deleting uploaded logs" },
  { key: "modules", label: "Deleting modules" },
  { key: "community", label: "Removing guild and server setup" },
  { key: "account", label: "Deleting your account" },
] as const;

type WizardStep = "review" | "confirm" | "final";

export function PurgeAccount() {
  const { data: session } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const purgeID = searchParams.get("purge") ?? undefined;
  const { data: inventory, error, refetch, isFetching } = useAccountPurgeInventory(!!session && !purgeID);
  const activePurgeID = purgeID ?? inventory?.active_purge?.id;

  if (activePurgeID) {
    return (
      <PurgeProgress
        purgeID={activePurgeID}
        onRetry={() => {
          const next = new URLSearchParams(searchParams);
          next.delete("purge");
          setSearchParams(next, { replace: true });
        }}
      />
    );
  }
  if (session === null) {
    return <div className="text-sm text-muted-foreground">Sign in to manage your account.</div>;
  }
  if (error) {
    return (
      <div role="alert" className="max-w-xl rounded-lg border border-destructive/40 p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold text-destructive">
          <XCircle className="size-5" /> Couldn't load your account data
        </div>
        <p className="break-words text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching && <Loader2 className="size-4 animate-spin" />} Try again
        </Button>
      </div>
    );
  }
  if (!inventory) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading your data...</div>;
  }
  return (
    <PurgeWizard
      data={inventory.data}
      blockers={inventory.blockers}
      recentSignInUntil={inventory.recent_sign_in_until}
      onStarted={(status) => setSearchParams({ purge: status.id }, { replace: true })}
    />
  );
}

function useSignInExpired(recentSignInUntil: string) {
  const until = new Date(recentSignInUntil).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const remaining = until - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), remaining + 500);
    return () => window.clearTimeout(timer);
  }, [until]);
  return now >= until;
}

async function signInAgain() {
  await fetch("/auth/logout", { method: "POST" });
  clearInstanceDefaultsCache();
  window.location.href = `/login?from=${encodeURIComponent("/account/purge")}`;
}

function PurgeWizard({ data, blockers, recentSignInUntil, onStarted }: {
  data: readonly AccountDataCount[];
  blockers: readonly string[];
  recentSignInUntil: string;
  onStarted: (status: AccountPurgeStatus) => void;
}) {
  const [step, setStep] = useState<WizardStep>("review");
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState("");
  const startPurge = useStartAccountPurge();

  const groups = useMemo(() => {
    const byKey = new Map<string, AccountDataCount[]>();
    for (const item of data) {
      byKey.set(item.group_key, [...(byKey.get(item.group_key) ?? []), item]);
    }
    return Array.from(byKey, ([key, items]) => ({ key, items }));
  }, [data]);
  const allAcknowledged = groups.every((group) => acknowledged.has(group.key));
  const blocked = blockers.length > 0;
  const signInExpired = useSignInExpired(recentSignInUntil);

  const toggle = (key: string, checked: boolean) => {
    setAcknowledged((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/account/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to settings
        </Link>
        <h2 className="mt-2 text-xl font-semibold">Purge Account</h2>
        <p className="text-muted-foreground">Permanently delete your account and everything attached to it.</p>
      </div>

      <ol className="flex items-center gap-2 text-sm">
        {(["review", "confirm", "final"] as const).map((key, index) => (
          <li key={key} className="flex items-center gap-2">
            {index > 0 && <span className="h-px w-6 bg-border" />}
            <span className={cn(
              "inline-flex size-6 items-center justify-center rounded-full border text-xs",
              step === key ? "border-destructive bg-destructive text-white" : "text-muted-foreground",
            )}>{index + 1}</span>
            <span className={step === key ? "font-medium" : "text-muted-foreground"}>
              {key === "review" ? "Review data" : key === "confirm" ? "Confirm" : "Purge"}
            </span>
          </li>
        ))}
      </ol>

      {blocked && (
        <div role="alert" className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-5 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-500">
            <AlertTriangle className="size-5" /> This account can't be purged here
          </div>
          <ul className="list-disc space-y-1 pl-6 text-sm">
            {blockers.map((blocker) => (
              <li key={blocker}>
                {blocker === "billing account" ? (
                  <>Accounts with billing history can't be purged here. <Link to="/contact" className="underline underline-offset-2">Contact us</Link> to delete your account.</>
                ) : blocker}
              </li>
            ))}
          </ul>
        </div>
      )}

      {signInExpired && (
        <div role="alert" className="rounded-lg border-2 border-primary/50 bg-primary/10 p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-primary/15 p-3">
              <LogIn className="size-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Sign in again to continue</h3>
              <p className="text-sm text-muted-foreground">
                For your security, purging your account requires a sign-in from the last 15 minutes. Sign out and back in, and you'll come right back here.
              </p>
            </div>
          </div>
          <div className="ml-[4.25rem]">
            <Button size="lg" onClick={() => void signInAgain()}>
              <LogIn className="size-5" /> Sign out and sign back in
            </Button>
          </div>
        </div>
      )}

      <fieldset
        disabled={signInExpired}
        aria-disabled={signInExpired}
        className={cn("min-w-0 space-y-6", signInExpired && "pointer-events-none select-none opacity-40")}
      >
        {step === "review" && (
          <div className="space-y-4">
            {groups.length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Your account has no saved data. Purging deletes the account itself.
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Tick every set of data to confirm you understand it will be permanently deleted.</p>
                <div className="space-y-3">
                  {groups.map((group) => {
                    const meta = DATA_GROUPS[group.key] ?? { title: group.key, description: "" };
                    const checked = acknowledged.has(group.key);
                    const id = `purge-${group.key}`;
                    return (
                      <div
                        key={group.key}
                        role="presentation"
                        onClick={() => toggle(group.key, !checked)}
                        className={cn(
                          "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors",
                          checked ? "border-destructive/60 bg-destructive/5" : "hover:bg-muted/40",
                        )}
                      >
                        <Checkbox
                          id={id}
                          aria-labelledby={`${id}-title`}
                          checked={checked}
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={(value) => toggle(group.key, value === true)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div id={`${id}-title`} className="font-medium">{meta.title}</div>
                          <p className="text-xs text-muted-foreground">{meta.description}</p>
                          <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
                            {group.items.map((item) => (
                              <li key={item.label}>
                                <span className="font-semibold tabular-nums">{item.count.toLocaleString()}</span>{" "}
                                <span className="text-muted-foreground">{item.label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{acknowledged.size} of {groups.length} confirmed</span>
              <Button variant="destructive" disabled={blocked || !allAcknowledged} onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="rounded-lg border border-destructive/40 p-5 space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold">Confirm it's you</h3>
              <p className="text-sm text-muted-foreground">
                For your security, you have until {new Date(recentSignInUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} to start the purge. After that you'll need to sign in again.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="purge-confirmation" className="block text-sm">
                Type <span className="font-mono font-semibold">{AccountPurgeConfirmation}</span> to continue
              </label>
              <Input
                id="purge-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                className="sm:max-w-sm"
              />
            </div>
            <div className="flex justify-between gap-3">
              <Button variant="ghost" onClick={() => setStep("review")}>Back</Button>
              <Button variant="destructive" disabled={confirmation.trim() !== AccountPurgeConfirmation} onClick={() => setStep("final")}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === "final" && (
          <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-6 space-y-4 text-center">
            <Trash2 className="mx-auto size-10 text-destructive" />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">This cannot be undone</h3>
              <p className="text-sm text-muted-foreground">
                Your account and everything you confirmed will be permanently deleted. You'll be signed out when it finishes.
              </p>
            </div>
            {startPurge.error && <p className="text-sm text-destructive">{startPurge.error.message}</p>}
            <div className="flex flex-col items-center gap-2">
              <Button
                size="lg"
                variant="destructive"
                disabled={startPurge.isPending}
                onClick={() => startPurge.mutate(
                  { acknowledged_groups: Array.from(acknowledged), confirmation: confirmation.trim() },
                  { onSuccess: onStarted },
                )}
              >
                {startPurge.isPending ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
                Purge my account
              </Button>
              <Button variant="ghost" onClick={() => setStep("confirm")} disabled={startPurge.isPending}>Back</Button>
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}

function PurgeProgress({ purgeID, onRetry }: { purgeID: string; onRetry: () => void }) {
  const queryClient = useQueryClient();
  const { data: status } = useAccountPurgeStatus(purgeID);
  const done = status?.status === "succeeded";
  const failed = status?.status === "failed";

  useEffect(() => {
    if (!done) return;
    // The server already revoked every session; this clears local state.
    void fetch("/auth/logout", { method: "POST" }).catch(() => {});
    clearInstanceDefaultsCache();
    queryClient.clear();
  }, [done, queryClient]);

  if (done) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border p-8 text-center space-y-4">
        <CheckCircle2 className="mx-auto size-12 text-green-500" />
        <h2 className="text-xl font-semibold">Your account has been deleted</h2>
        <p className="text-sm text-muted-foreground">Everything you confirmed has been removed and you've been signed out.</p>
        <Button size="lg" onClick={() => { window.location.href = "/"; }}>Return home</Button>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-destructive/40 p-8 text-center space-y-4">
        <XCircle className="mx-auto size-12 text-destructive" />
        <h2 className="text-xl font-semibold">The purge didn't finish</h2>
        <p className="text-sm text-muted-foreground">{status.error}</p>
        <Button size="lg" variant="outline" onClick={() => { void queryClient.invalidateQueries({ queryKey: ["account-purge"] }); onRetry(); }}>
          Review and try again
        </Button>
      </div>
    );
  }

  const currentIndex = PURGE_STEPS.findIndex((step) => step.key === status?.step);
  return (
    <div className="mx-auto max-w-lg rounded-lg border p-8 space-y-6">
      <div className="space-y-1 text-center">
        <Loader2 className="mx-auto size-10 animate-spin text-muted-foreground" />
        <h2 className="text-xl font-semibold">Purging your account</h2>
        <p className="text-sm text-muted-foreground">You can keep this page open. New uploads are disabled until it finishes.</p>
      </div>
      <ol className="space-y-3">
        {PURGE_STEPS.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
          return (
            <li key={step.key} className="flex items-center gap-3 text-sm">
              {state === "done" ? <CheckCircle2 className="size-5 text-green-500" />
                : state === "active" ? <Loader2 className="size-5 animate-spin text-primary" />
                  : <Circle className="size-5 text-muted-foreground" />}
              <span className={state === "pending" ? "text-muted-foreground" : ""}>{step.label}</span>
              {step.key === "logs" && status && status.logs_total > 0 && (
                <span className="ml-auto tabular-nums text-muted-foreground">{status.logs_deleted} / {status.logs_total}</span>
              )}
            </li>
          );
        })}
      </ol>
      {status && status.logs_total > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-destructive transition-all" style={{ width: `${(status.logs_deleted / status.logs_total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
