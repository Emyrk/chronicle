import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useUpdateAutoDeleteRawLogsPreference } from "@/api/storagePreferences";
import { Switch } from "@/components/ui/Switch/Switch";
import { cn } from "@/lib/utils";

/** Toggle for deleting the oldest unpinned raw logs when an upload would exceed the storage limit. */
export function AutoCleanupToggle({ enabled: savedEnabled }: { enabled: boolean }) {
  const updateAutoDelete = useUpdateAutoDeleteRawLogsPreference();
  const enabled = updateAutoDelete.isPending && updateAutoDelete.variables !== undefined
    ? updateAutoDelete.variables
    : savedEnabled;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border p-3",
        enabled ? "border-primary/40 bg-primary/10" : "border-border bg-muted/50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <ShieldCheck className={cn("mt-0.5 size-5 shrink-0", enabled ? "text-primary" : "text-muted-foreground")} />
        <div>
          <h2 className="text-sm font-semibold">Automatically prevent storage from filling up</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            When an upload would exceed your limit, delete the oldest unpinned raw files that have finished parsing.
            Parsed reports stay available. Pin any raw log you need to keep.
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        disabled={updateAutoDelete.isPending}
        aria-label="Automatically delete old raw logs when storage is full"
        onCheckedChange={(next) => {
          updateAutoDelete.mutate(next, {
            onSuccess: () => toast.success(next ? "Automatic storage cleanup enabled" : "Automatic storage cleanup disabled"),
            onError: (error) => toast.error("Failed to update storage cleanup", { description: error.message }),
          });
        }}
      />
    </div>
  );
}
