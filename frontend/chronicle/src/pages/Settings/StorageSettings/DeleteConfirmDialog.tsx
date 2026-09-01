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

function groupNames(groups: ActivePendingAction["groups"]): string {
  return groups
    .map((g) => {
      const instances = getParsedInstances(g);
      return instances.length > 0 ? instances.map((i) => i.name).join(", ") : "this upload";
    })
    .join(", ");
}

function buildCopy(action: ActivePendingAction): { title: string; body: string; confirmLabel: string } {
  const names = groupNames(action.groups);

  if (action.kind === "delete-raw") {
    const freed = action.groups.reduce((sum, g) => sum + activeQuotaBytes(g), 0);
    let body =
      `Your parsed reports for ${names} will remain available. The original combat-log files will be ` +
      `permanently removed. Without them, Chronicle cannot investigate parser issues or re-parse ` +
      `${action.groups.length > 1 ? "these uploads" : "this upload"}.`;

    const failedNames = groupNames(action.groups.filter((g) => deriveLogStatus(g).status === "parse_failed"));
    if (failedNames) {
      body += ` Parsing failed for ${failedNames} — raw files may be the only way to recover this log.`;
    }
    if (action.excludedCount > 0) {
      body += ` ${action.excludedCount} selected log${action.excludedCount > 1 ? "s were" : " was"} skipped because its raw files are already deleted or still processing.`;
    }
    return { title: `Delete raw files and free ${formatBytes(freed)}?`, body, confirmLabel: "Delete raw files" };
  }

  if (action.kind === "delete-parsed") {
    const allRawGone = activeQuotaBytes(action.groups[0]) === 0;
    const body =
      `This removes the parsed instances, encounters, and analytics for this log. This does not change your ` +
      `raw storage usage. ${
        allRawGone
          ? "This log has no raw files remaining, so this removes the only available copy of this data."
          : "Raw files, if present, will be kept."
      }`;
    return { title: `Delete parsed data for ${names}?`, body, confirmLabel: "Delete parsed data" };
  }

  return {
    title: "Delete entire log group?",
    body: `This permanently deletes ${names} — both the raw files and all parsed reports, encounters, and analytics. This cannot be undone.`,
    confirmLabel: "Delete entire log",
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

  const { title, body, confirmLabel } = buildCopy(action);

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
