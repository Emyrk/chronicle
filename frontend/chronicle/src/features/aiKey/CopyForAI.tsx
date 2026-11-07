import { useCallback, useMemo, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronDown, ChevronRight, ExternalLink, Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { AI_KEY_QUERY_KEY, fetchAIKeyUsage, issueAIKey } from "@/api/aiKey";
import { useSession } from "@/api/queries";
import type { AIKeyUsage } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/Collapsible/Collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { aiTarget, buildAIText, buildOpenURL, suggestionsFor, withAIKey } from "./aiLinks";
import { acknowledgeWarning, isWarningAcknowledged, loadAITarget, loadLifetimeHours, saveAITarget, saveLifetimeHours, secretFromResponse } from "./aiKeyStore";
import { AI_TARGETS, type AIPageType, type AIPromptValues, type AITargetId } from "./aiPrompts";
import { AIKeyWarningDialog, type AIKeyChoice } from "./AIKeyWarningDialog";
import { pickLifetime } from "./aiKeyFormat";

export interface CopyForAIControlProps {
  target: AITargetId;
  onTargetChange: (target: AITargetId) => void;
  /** Filled starter questions for this page. */
  suggestions: string[];
  /** Run the main action: copy (or open) the link, with an optional question. */
  onRun: (question: string | null) => void;
  busy?: boolean;
  /** Set when the button can't be used, e.g. "Log in to …". */
  disabledReason?: string;
  /** Open the options popover (stories). */
  defaultOptionsOpen?: boolean;
  /** Expand "Add a question" (stories). */
  defaultQuestionsOpen?: boolean;
  className?: string;
}

/**
 * CopyForAIControl is the button plus its options: the chat AI picker and the
 * collapsed "Add a question" list. The default copies just the link.
 */
export function CopyForAIControl({
  target,
  onTargetChange,
  suggestions,
  onRun,
  busy,
  disabledReason,
  defaultOptionsOpen,
  defaultQuestionsOpen,
  className,
}: CopyForAIControlProps) {
  const [open, setOpen] = useState(!!defaultOptionsOpen);
  const t = aiTarget(target);
  const opens = !!t.prefillURL;
  const label = opens ? `Open in ${t.label}` : "Copy for AI";
  const disabled = !!disabledReason || busy;

  const main = (
    <Button variant="outline" size="sm" className="gap-1.5 rounded-r-none" disabled={disabled} onClick={() => onRun(null)}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : opens ? <ExternalLink className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      {label}
    </Button>
  );

  return (
    <div className={cn("inline-flex items-center", className)}>
      {disabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{main}</span>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      ) : (
        main
      )}
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="rounded-l-none border-l-0 px-1.5"
            disabled={!!disabledReason}
            aria-label="Copy for AI options"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="end"
            sideOffset={4}
            className="z-50 w-[22rem] space-y-3 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none"
          >
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Pick your chat AI</p>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Chat AI">
                {AI_TARGETS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={option.id === target}
                    onClick={() => onTargetChange(option.id)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition-colors",
                      option.id === target
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t.tip}</p>
            </div>

            <Collapsible defaultOpen={defaultQuestionsOpen} className="border-t pt-2">
              <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Add a question
              </CollapsibleTrigger>
              <CollapsibleContent>
                {suggestions.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">No suggestions for this page. Just ask your own.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {suggestions.map((q) => (
                      <li key={q}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setOpen(false);
                            onRun(q);
                          }}
                          className="w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                        >
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CollapsibleContent>
            </Collapsible>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}

/**
 * copyText writes text that may still be on its way. It starts the write while
 * the click still counts as a user gesture (Safari needs that); browsers
 * without ClipboardItem wait for the text and use writeText.
 */
async function copyText(text: Promise<string>): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(await text);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(await text);
      return true;
    } catch {
      return false;
    }
  }
}

type Pending = { question: string | null };

/** rereadSecret checks storage once more after a moment, for a key another tab just made. */
async function rereadSecret(userID: string, resp: { key: { id: string } }): Promise<string | null> {
  await new Promise((r) => setTimeout(r, 300));
  return secretFromResponse(userID, resp);
}

export interface CopyForAIProps {
  page: AIPageType;
  /** Values for question placeholders: {character}, {guild}, {raid}… */
  values?: AIPromptValues;
  /**
   * The absolute page link to give the AI. Required: only some routes have an
   * agent view (see pageAIURL / searchAIURL), so a page must say which.
   */
  url: string;
  className?: string;
}

/**
 * CopyForAI copies the page link with the user's AI key, or opens it in the
 * picked chat AI. The key is get-or-create; this browser keeps the secret
 * because the server can't show it again. If a key exists but this browser
 * doesn't have it, the user can make a new link (rotate) after a confirmation.
 */
export function CopyForAI({ page, values = {}, url, className }: CopyForAIProps) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userID = session?.user_id;
  const loggedIn = !!userID;
  const [target, setTarget] = useState<AITargetId>(loadAITarget);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<Pending | null>(null);
  const [rotate, setRotate] = useState<Pending | null>(null);
  const [usage, setUsage] = useState<AIKeyUsage | undefined>();

  const suggestions = useMemo(() => suggestionsFor(page, values), [page, values]);

  const loadUsage = useCallback(
    () => queryClient.fetchQuery({ queryKey: AI_KEY_QUERY_KEY, queryFn: fetchAIKeyUsage, staleTime: 30_000 }),
    [queryClient],
  );

  const onTargetChange = (id: AITargetId) => {
    setTarget(id);
    saveAITarget(id);
  };

  const perform = useCallback(
    async (question: string | null, opts: { choice?: AIKeyChoice; rotate?: boolean } = {}) => {
      if (!userID) return;
      const t = aiTarget(target);
      let resolveText!: (text: string) => void;
      let rejectText!: (err: unknown) => void;
      const textPromise = new Promise<string>((res, rej) => {
        resolveText = res;
        rejectText = rej;
      });
      textPromise.catch(() => {});
      // Start the clipboard write first: once the new tab opens this document
      // loses focus and Chrome rejects writes ("Document is not focused").
      const copied = copyText(textPromise);
      // Open the tab now, while this is still a click, or popup blockers stop it.
      const win = t.prefillURL ? window.open("", "_blank") : null;

      setBusy(true);
      try {
        const current = await loadUsage();
        const lifetime = opts.choice?.lifetimeHours ?? pickLifetime(current.benefits, loadLifetimeHours());
        const resp = await issueAIKey(
          userID,
          {
            lifetime_hours: lifetime,
            private_data: opts.choice?.privateData ?? (opts.rotate ? current.key?.private_data : false) ?? false,
          },
          !!opts.rotate,
        );
        void queryClient.invalidateQueries({ queryKey: AI_KEY_QUERY_KEY });
        // Another tab may have just made this key (201) and not saved it yet.
        const secret = secretFromResponse(userID, resp) ?? (await rereadSecret(userID, resp));
        if (!secret) {
          rejectText(new Error("no secret"));
          win?.close();
          setRotate({ question });
          return;
        }
        const text = buildAIText(withAIKey(url, secret), question);
        resolveText(text);
        const openURL = buildOpenURL(t, text);
        if (win && openURL) {
          win.opener = null;
          win.location.href = openURL;
        }
        const ok = await copied;
        if (openURL) {
          toast.success(`Opened in ${t.label}`, { description: ok ? "Also copied, in case the prompt box is empty." : undefined });
        } else if (ok) {
          toast.success(question ? "Question and AI link copied" : "AI link copied", {
            description: t.id === "gemini" ? "Paste it into Gemini." : "Paste it into your AI chat.",
          });
        } else {
          toast.error("Couldn't copy to the clipboard");
        }
      } catch (err) {
        rejectText(err);
        win?.close();
        toast.error("Couldn't make your AI link", { description: err instanceof Error ? err.message : undefined });
      } finally {
        setBusy(false);
      }
    },
    [loadUsage, queryClient, target, url, userID],
  );

  const onRun = (question: string | null) => {
    if (!isWarningAcknowledged(userID)) {
      setWarning({ question });
      void loadUsage().then(setUsage, () => {});
      return;
    }
    void perform(question);
  };

  const t = aiTarget(target);
  const actionLabel = t.prefillURL ? `Open in ${t.label}` : "Copy for AI";
  const existingKey = usage?.key && !usage.key.expired ? usage.key : undefined;

  return (
    <>
      <CopyForAIControl
        target={target}
        onTargetChange={onTargetChange}
        suggestions={suggestions}
        onRun={onRun}
        busy={busy}
        disabledReason={loggedIn ? undefined : "Log in to copy a link your chat AI can read"}
        className={className}
      />
      <AIKeyWarningDialog
        open={!!warning}
        onOpenChange={(open) => !open && setWarning(null)}
        benefits={usage?.benefits}
        existingKey={existingKey}
        defaultLifetimeHours={loadLifetimeHours()}
        busy={busy}
        actionLabel={actionLabel}
        onConfirm={(choice) => {
          const pending = warning;
          if (userID) acknowledgeWarning(userID);
          saveLifetimeHours(choice.lifetimeHours);
          setWarning(null);
          void perform(pending?.question ?? null, existingKey ? {} : { choice });
        }}
      />
      <Dialog open={!!rotate} onOpenChange={(open) => !open && setRotate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make a new AI link?</DialogTitle>
            <DialogDescription>
              This browser doesn't have your current AI key, and Chronicle can't show it again. A new link stops your old AI links from
              working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRotate(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const pending = rotate;
                setRotate(null);
                void perform(pending?.question ?? null, { rotate: true });
              }}
            >
              Make a new link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
