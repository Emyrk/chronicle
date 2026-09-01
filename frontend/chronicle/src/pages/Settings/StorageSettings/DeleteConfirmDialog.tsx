import { useState } from "react";
import { toast } from "sonner";
import { useDeleteLogFiles, useDeleteLogGroup, useDeleteLogInstance } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBytes } from "@/lib/format";
import { deriveLogStatus, getParsedInstances } from "@/lib/logStatus";
import { activeQuotaBytes } from "./logMetrics";
import type { PendingAction } from "./types";

type ActivePendingAction = NonNullable<PendingAction>;

/** One row in the compact "what this affects" list shown below the (static) warning text. */
interface AffectedItem {
  label: string;
  tag?: string;
}

interface CopyResult {
  title: string;
  body: string;
  /** Optional static aside — never contains instance names, only counts/facts. */
  note?: string;
  confirmLabel: string;
  affectedItems: AffectedItem[];
}

function instanceLabel(group: ActivePendingAction["groups"][number]): string {
  const instances = getParsedInstances(group);
  return instances.length > 0 ? instances.map((i) => i.name).join(", ") : "Unparsed upload";
}

/**
 * The title/body/confirm copy is deliberately static — the same wording every
 * time, regardless of which or how many logs are selected — so it reads as a
 * molly guard: recognizable at a glance rather than a sentence that has to be
 * re-parsed each time because it names different logs. The specific logs
 * being affected are listed separately, in the compact affectedItems list.
 */
function buildCopy(action: ActivePendingAction): CopyResult {
  if (action.kind === "delete-raw") {
    const freed = action.groups.reduce((sum, g) => sum + activeQuotaBytes(g), 0);
    const body =
      "Parsed reports will remain available. The original combat-log files will be permanently removed — " +
      "Chronicle will no longer be able to investigate parser issues or re-parse them later.";
    const note =
      action.excludedCount > 0
        ? `${action.excludedCount} selected log${action.excludedCount === 1 ? "" : "s"} ${
            action.excludedCount === 1 ? "was" : "were"
          } skipped because its raw files are already deleted or still processing.`
        : undefined;
    const affectedItems = action.groups.map((g) => ({
      label: instanceLabel(g),
      tag: deriveLogStatus(g).status === "parse_failed" ? "Parse failed" : undefined,
    }));
    return { title: `Delete raw files and free ${formatBytes(freed)}?`, body, note, confirmLabel: "Delete raw files", affectedItems };
  }

  if (action.kind === "delete-parsed") {
    const group = action.groups[0];
    const allRawGone = activeQuotaBytes(group) === 0;
    const body = "This removes the parsed instances, encounters, and analytics for this log. This does not change your raw storage usage.";
    const note = allRawGone
      ? "This log has no raw files remaining, so this removes the only available copy of this data."
      : "Raw files, if present, will be kept.";
    const instances = getParsedInstances(group);
    const affectedItems = instances.length > 0 ? instances.map((i) => ({ label: i.name })) : [{ label: "Unparsed upload" }];
    return { title: "Delete parsed data?", body, note, confirmLabel: "Delete parsed data", affectedItems };
  }

  return {
    title: "Delete entire log group?",
    body: "This permanently deletes both the raw files and all parsed reports, encounters, and analytics. This cannot be undone.",
    confirmLabel: "Delete entire log",
    affectedItems: action.groups.map((g) => ({ label: instanceLabel(g) })),
  };
}

interface DeleteConfirmDialogProps {
  action: ActivePendingAction;
  onClose: () => void;
}

export function DeleteConfirmDialog({ action, onClose }: DeleteConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const deleteFiles = useDeleteLogFiles();
  const deleteInstance = useDeleteLogInstance();
  const deleteGroup = useDeleteLogGroup();

  const { title, body, note, confirmLabel, affectedItems } = buildCopy(action);

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      if (action.kind === "delete-raw") {
        const results = await Promise.allSettled(action.groups.map((g) => deleteFiles.mutateAsync(g.id)));
        const failures = results.filter((r) => r.status === "rejected").length;
        if (failures > 0) {
          toast.error(`Failed to delete raw files for ${failures} log${failures > 1 ? "s" : ""}.`);
        } else {
          toast.success("Raw files deleted.");
          action.onSuccess?.();
        }
      } else if (action.kind === "delete-parsed") {
        const group = action.groups[0];
        const instances = getParsedInstances(group);
        const results = await Promise.allSettled(
          instances.map((inst) => deleteInstance.mutateAsync({ logId: group.id, instanceId: inst.id })),
        );
        const failures = results.filter((r) => r.status === "rejected").length;
        if (failures > 0) {
          toast.error(`Failed to delete ${failures} of ${instances.length} parsed instances.`);
        } else {
          toast.success("Parsed data deleted.");
        }
      } else {
        await deleteGroup.mutateAsync(action.groups[0].id);
        toast.success("Log deleted.");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete the requested action.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{body}</DialogDescription>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {affectedItems.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="truncate">{item.label}</span>
              {item.tag && (
                <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                  {item.tag}
                </span>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isSubmitting}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
