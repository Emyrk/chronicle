import { useState } from "react";
import { AlertTriangle, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UnlistedConfirmationDialogProps {
  disabled?: boolean;
  isPending: boolean;
  onConfirm: () => void;
  /** Render the trigger as a small, muted inline button (it's a rare action). */
  compact?: boolean;
}

export function UnlistedConfirmationDialog({
  disabled = false,
  isPending,
  onConfirm,
  compact = false,
}: UnlistedConfirmationDialogProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);

  const setOpen = (open: boolean) => {
    if (!open && !isPending) {
      setStep(0);
    }
  };

  return (
    <>
      <Button
        variant={compact ? "ghost" : "outline"}
        size={compact ? "sm" : "default"}
        disabled={disabled}
        onClick={() => setStep(1)}
        className={compact ? "h-auto gap-1 px-1.5 py-0.5 text-xs font-normal text-muted-foreground" : undefined}
      >
        {compact && <LockKeyhole className="h-3 w-3" />}
        Make unlisted
      </Button>

      <Dialog open={step !== 0} onOpenChange={setOpen}>
        <DialogContent showCloseButton={!isPending}>
          {step === 1 ? (
            <>
              <DialogHeader>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">
                  Confirmation 1 of 2
                </p>
                <DialogTitle className="flex items-center gap-2">
                  <LockKeyhole className="h-5 w-5 text-amber-500" />
                  Make this log unlisted?
                </DialogTitle>
                <DialogDescription className="space-y-2">
                  <span className="block">
                    The log will disappear from rankings, leaderboards, search, and public discovery.
                  </span>
                  <span className="block">
                    Anyone with its direct link will still be able to view and share it.
                  </span>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Cancel
                </Button>
                <Button variant="outline" onClick={() => setStep(2)}>
                  Continue
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                  Final confirmation
                </p>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  This cannot be undone
                </DialogTitle>
                <DialogDescription>
                  Once this log is unlisted, it can never be made public again. This is a permanent change.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                You will not be able to restore this log to rankings or public discovery later.
              </div>
              <DialogFooter>
                <Button variant="ghost" disabled={isPending} onClick={() => setStep(1)}>
                  Go back
                </Button>
                <Button variant="destructive" disabled={isPending} onClick={onConfirm}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Permanently make unlisted
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
