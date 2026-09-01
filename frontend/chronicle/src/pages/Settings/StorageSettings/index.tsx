import { useState } from "react";
import { Play } from "lucide-react";
import { useLogGroups, useMyStorage, useSiteConfig, type UserStorageInfo, type WoWLogGroup } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { LogsTable } from "./LogsTable";
import { ParsedDataCard } from "./ParsedDataCard";
import { RawStorageCard } from "./RawStorageCard";
import type { PendingAction } from "./types";

export interface StorageSettingsViewProps {
  storage: UserStorageInfo | undefined;
  storageLoading: boolean;
  logs: WoWLogGroup[] | undefined;
  logsLoading: boolean;
  /** Name of the tenant currently being browsed (subdomain), or null on the root domain. */
  currentTenantName: string | null;
}

export function StorageSettingsView({
  storage,
  storageLoading,
  logs,
  logsLoading,
  currentTenantName,
}: StorageSettingsViewProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Storage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View your storage usage, grants, and manage your uploaded logs.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setVideoOpen(true)}>
          <Play className="size-3.5" />
          How storage works
        </Button>
      </div>

      {storageLoading || !storage ? (
        <p className="text-sm text-muted-foreground">Loading storage information...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <RawStorageCard storage={storage} />
          <ParsedDataCard storage={storage} />
        </div>
      )}

      {logsLoading || !logs ? (
        <p className="text-sm text-muted-foreground">Loading your logs...</p>
      ) : (
        <LogsTable logs={logs} currentTenantName={currentTenantName} onRequestDelete={setPendingAction} />
      )}

      {pendingAction && <DeleteConfirmDialog action={pendingAction} onClose={() => setPendingAction(null)} />}

      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>How storage works</DialogTitle>
          </DialogHeader>
          {videoOpen && (
            <video
              src="/c/videos/storage-story.mp4"
              controls
              autoPlay
              className="w-full rounded-md bg-black"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StorageSettings() {
  const { data: storage, isLoading: storageLoading } = useMyStorage();
  const { data: logs, isLoading: logsLoading } = useLogGroups({ allTenants: true });
  const { data: siteConfig } = useSiteConfig();

  return (
    <StorageSettingsView
      storage={storage}
      storageLoading={storageLoading}
      logs={logs}
      logsLoading={logsLoading}
      currentTenantName={siteConfig?.tenant?.name ?? null}
    />
  );
}
