import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import type { AIKey, AIKeyBenefits } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatLifetime } from "./aiLinks";
import { AI_KEY_OPEN_IN_WARNING, AI_KEY_WARNING } from "./aiPrompts";
import { formatExpiry, pickLifetime } from "./aiKeyFormat";

export interface AIKeyChoice {
  lifetimeHours: number;
  privateData: boolean;
}

export interface AIKeyWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tier's benefits; undefined while loading. */
  benefits?: AIKeyBenefits;
  /** A working key that already exists; its expiry and settings apply. */
  existingKey?: AIKey;
  defaultLifetimeHours: number | null;
  busy?: boolean;
  /** The confirm button, e.g. "Copy for AI" or "Open in Claude". */
  actionLabel?: string;
  onConfirm: (choice: AIKeyChoice) => void;
}

/**
 * AIKeyWarningDialog is the one-time warning before the first AI link. The
 * user must tick the checkbox. A new key's lifetime and private-data opt-in
 * are chosen here.
 */
export function AIKeyWarningDialog({ open, onOpenChange, benefits, existingKey, defaultLifetimeHours, busy, actionLabel = "Copy for AI", onConfirm }: AIKeyWarningDialogProps) {
  const [understood, setUnderstood] = useState(false);
  const [chosenLifetime, setLifetime] = useState<number | null>(null);
  const [privateData, setPrivateData] = useState(false);
  const lifetime = chosenLifetime && benefits?.lifetime_hours.includes(chosenLifetime) ? chosenLifetime : pickLifetime(benefits, defaultLifetimeHours);

  const changeOpen = (next: boolean) => {
    if (!next) setUnderstood(false);
    onOpenChange(next);
  };

  const expiry = existingKey
    ? formatExpiry(new Date(existingKey.expires_at))
    : `${formatLifetime(lifetime)} from now`;
  const warning = AI_KEY_WARNING.replace("{expiry}", expiry);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-500" />
            Your AI link is a key
          </DialogTitle>
          <DialogDescription>Copy for AI adds a private key to the link so your chat AI can read Chronicle as you.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>{warning}</p>
          <p className="text-muted-foreground">{AI_KEY_OPEN_IN_WARNING}</p>
        </div>

        {existingKey ? (
          <p className="text-sm text-muted-foreground">
            You already have an AI key. It works until {expiry}
            {existingKey.private_data ? " and can read your private data" : ""}. Change it in{" "}
            <Link to="/account/ai-access" className="underline" onClick={() => changeOpen(false)}>
              Settings → AI access
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <fieldset className="space-y-1.5">
              <legend className="font-medium">Key lifetime</legend>
              {benefits ? (
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Key lifetime">
                  {benefits.lifetime_hours.map((h) => (
                    <Button
                      key={h}
                      type="button"
                      size="sm"
                      role="radio"
                      aria-checked={lifetime === h}
                      variant={lifetime === h ? "default" : "outline"}
                      onClick={() => setLifetime(h)}
                    >
                      {formatLifetime(h)}
                    </Button>
                  ))}
                </div>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <p className="text-xs text-muted-foreground">
                Supporters can pick longer keys. <Link to="/supporter" className="underline">See tiers</Link>
              </p>
            </fieldset>
            {benefits?.private_data && (
              <label className="flex items-start gap-2">
                <Checkbox checked={privateData} onCheckedChange={(v) => setPrivateData(v === true)} className="mt-0.5" />
                <span>
                  Let the key read my private data (unlisted logs, guild rosters).
                  <span className="block text-xs text-muted-foreground">Off by default.</span>
                </span>
              </label>
            )}
          </div>
        )}

        <label className="flex items-start gap-2 text-sm font-medium">
          <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} className="mt-0.5" aria-label="I understand" />
          <span>I understand. I'll paste this link only into my own AI chat.</span>
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!understood || busy || (!existingKey && !benefits)}
            onClick={() => {
              setUnderstood(false);
              onConfirm({ lifetimeHours: lifetime, privateData });
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
