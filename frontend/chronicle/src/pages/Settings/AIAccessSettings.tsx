import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Check, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useIssueAIKey, useMyAIKey, useRevokeAIKey } from "@/api/aiKey";
import { useSession } from "@/api/queries";
import type { AIKey, AIKeyBenefits, AIKeyUsage } from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatLifetime } from "@/features/aiKey/aiLinks";
import { loadLifetimeHours, saveLifetimeHours, storedSecretFor } from "@/features/aiKey/aiKeyStore";
import { AI_KEY_OPEN_IN_WARNING, AI_KEY_WARNING } from "@/features/aiKey/aiPrompts";
import { clientName, formatExpiry, pickLifetime } from "@/features/aiKey/aiKeyFormat";

const TIER_LABELS: Record<string, string> = { free: "Free", honored: "Honored", revered: "Revered", exalted: "Exalted" };
const tierLabel = (tier: string) => TIER_LABELS[tier] ?? tier;

function relative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [ms, unit] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(0, "minute");
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function KeyStatus({ aiKey, usage, userID }: { aiKey: AIKey; usage: AIKeyUsage; userID: string | undefined }) {
  const inBrowser = !!storedSecretFor(userID, aiKey.id);
  return (
    <dl className="divide-y divide-border">
      <Row label="Status">
        {aiKey.expired ? <span className="text-destructive">Expired</span> : <span className="text-emerald-500">Active</span>}
      </Row>
      <Row label={aiKey.expired ? "Expired" : "Expires"}>
        {formatExpiry(new Date(aiKey.expires_at))} <span className="text-muted-foreground">({relative(aiKey.expires_at)})</span>
      </Row>
      <Row label="Created">{formatExpiry(new Date(aiKey.created_at))}</Row>
      <Row label="Last used">{aiKey.last_used_at ? `${formatExpiry(new Date(aiKey.last_used_at))} (${relative(aiKey.last_used_at)})` : "Never"}</Row>
      <Row label="Client">
        <span title={aiKey.last_user_agent}>{clientName(aiKey.last_user_agent)}</span>
      </Row>
      <Row label="Requests">{aiKey.request_count.toLocaleString()}</Row>
      <Row label="Views left today">
        {usage.views_remaining_today.toLocaleString()} of {usage.benefits.views_per_day.toLocaleString()}
      </Row>
      <Row label="Private data">{aiKey.private_data ? "Can read" : "Off"}</Row>
      <Row label="This browser">
        {inBrowser ? "Has the key: Copy for AI reuses it" : "Doesn't have the key: Copy for AI will offer a new link"}
      </Row>
    </dl>
  );
}

export function TierTable({ tiers, current }: { tiers: readonly AIKeyBenefits[]; current: string }) {
  const rows: [string, (b: AIKeyBenefits) => string][] = [
    ["Key lifetime options", (b) => b.lifetime_hours.map(formatLifetime).join(" · ")],
    ["Views per minute", (b) => b.views_per_minute.toLocaleString()],
    ["Views per day", (b) => b.views_per_day.toLocaleString()],
    ["Results per search", (b) => b.results_per_search.toLocaleString()],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="py-2 pr-3 text-left font-normal text-muted-foreground" />
            {tiers.map((t) => (
              <th key={t.tier} className={cn("px-2 py-2 text-left font-medium", t.tier === current && "text-primary")}>
                {tierLabel(t.tier)}
                {t.tier === current && <span className="ml-1 text-xs font-normal">(you)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="py-2 pr-3 text-muted-foreground">{label}</td>
              {tiers.map((t) => (
                <td key={t.tier} className={cn("px-2 py-2", t.tier === current && "bg-primary/10")}>
                  {value(t)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">Searches also use your normal search budget, fields and sorts for your tier.</p>
    </div>
  );
}

type Confirm = "rotate" | "revoke" | null;

/** Settings → AI access: the user's AI key, its usage, rotate/revoke and tier benefits. */
export function AIAccessSettings() {
  const { data: usage, isLoading, error } = useMyAIKey();
  const { data: session } = useSession();
  const userID = session?.user_id;
  const issue = useIssueAIKey();
  const revoke = useRevokeAIKey();
  const [chosenLifetime, setLifetime] = useState<number | null>(null);
  const [chosenPrivateData, setPrivateData] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const lifetime = pickLifetime(usage?.benefits, chosenLifetime ?? loadLifetimeHours());
  const privateData = chosenPrivateData ?? usage?.key?.private_data ?? false;

  const aiKey = usage?.key;
  const working = aiKey && !aiKey.expired;
  const topTier = usage ? usage.tiers[usage.tiers.length - 1]?.tier === usage.benefits.tier : true;

  const makeKey = (rotate: boolean) => {
    saveLifetimeHours(lifetime);
    if (!userID) return;
    issue.mutate(
      { userID, req: { lifetime_hours: lifetime, private_data: privateData }, rotate },
      {
        onSuccess: (resp) =>
          toast.success(rotate ? "New AI key made. Old links stopped working." : "AI key made.", {
            description: resp.created ? "Use Copy for AI on a raid, character, guild or search page." : undefined,
          }),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6" /> AI access
        </h2>
        <p className="text-muted-foreground">
          Copy for AI gives your chat AI (ChatGPT, Claude, Grok…) a link it can read as you, with no app to connect. The link carries a
          short-lived, read-only AI key.
        </p>
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : error || !usage ? (
        <Card className="p-4 text-sm text-destructive">{error?.message ?? "Couldn't load your AI key."}</Card>
      ) : (
        <>
          <Card className="space-y-4 p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <KeyRound className="h-4 w-4" /> Your AI key
            </h3>
            {aiKey ? <KeyStatus aiKey={aiKey} usage={usage} userID={userID} /> : <p className="text-sm text-muted-foreground">You have no AI key yet.</p>}

            <div className="space-y-3 border-t pt-4 text-sm">
              <p className="font-medium">{working ? "Settings for your next key" : "New key"}</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Key lifetime">
                {usage.benefits.lifetime_hours.map((h) => (
                  <Button
                    key={h}
                    type="button"
                    size="sm"
                    role="radio"
                    aria-checked={lifetime === h}
                    variant={lifetime === h ? "default" : "outline"}
                    onClick={() => {
                      setLifetime(h);
                      saveLifetimeHours(h);
                    }}
                  >
                    {lifetime === h && <Check className="h-3.5 w-3.5" />}
                    {formatLifetime(h)}
                  </Button>
                ))}
              </div>
              {usage.benefits.private_data && (
                <label className="flex items-start gap-2">
                  <Checkbox checked={privateData} onCheckedChange={(v) => setPrivateData(v === true)} className="mt-0.5" />
                  <span>Let the key read my private data (unlisted logs, guild rosters). Off by default.</span>
                </label>
              )}
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                {AI_KEY_WARNING.replace("{expiry}", "it expires")} {AI_KEY_OPEN_IN_WARNING}
              </p>
              <div className="flex flex-wrap gap-2">
                {working ? (
                  <>
                    <Button variant="outline" size="sm" disabled={issue.isPending} onClick={() => setConfirm("rotate")}>
                      <RefreshCw className="h-4 w-4" /> Rotate key
                    </Button>
                    <Button variant="destructive" size="sm" disabled={revoke.isPending} onClick={() => setConfirm("revoke")}>
                      <Trash2 className="h-4 w-4" /> Revoke
                    </Button>
                  </>
                ) : (
                  <Button size="sm" disabled={issue.isPending} onClick={() => makeKey(false)}>
                    {issue.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Make a key
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h3 className="font-semibold">What your tier gives ({tierLabel(usage.benefits.tier)})</h3>
            <TierTable tiers={usage.tiers} current={usage.benefits.tier} />
            {!topTier && (
              <Link to="/supporter" className="inline-block text-sm text-primary underline">
                Upgrade for longer keys and more views
              </Link>
            )}
          </Card>
        </>
      )}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "rotate" ? "Rotate your AI key?" : "Revoke your AI key?"}</DialogTitle>
            <DialogDescription>
              {confirm === "rotate"
                ? `Links with your current key stop working. The new key lasts ${formatLifetime(lifetime)}.`
                : "Links with your key stop working right away. Copy for AI makes a new key next time."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm === "revoke" ? "destructive" : "default"}
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                if (action === "rotate") makeKey(true);
                else
                  revoke.mutate(undefined, {
                    onSuccess: (msg) => toast.success(msg),
                    onError: (err) => toast.error(err.message),
                  });
              }}
            >
              {confirm === "rotate" ? "Rotate" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
