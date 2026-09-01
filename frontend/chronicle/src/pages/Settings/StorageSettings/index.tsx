import { useState } from "react";
import { useLogGroups, useMyStorage, type UserStorageInfo, type WoWLogGroup } from "@/api/queries";
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
}

export function StorageSettingsView({ storage, storageLoading, logs, logsLoading }: StorageSettingsViewProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Storage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View your storage usage, grants, and manage your uploaded logs.
        </p>
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
        <LogsTable logs={logs} onRequestDelete={setPendingAction} />
      )}

      {pendingAction && <DeleteConfirmDialog action={pendingAction} onClose={() => setPendingAction(null)} />}
    </div>
  );
}

export function StorageSettings() {
  const { data: storage, isLoading: storageLoading } = useMyStorage();
  const { data: logs, isLoading: logsLoading } = useLogGroups();

  return <StorageSettingsView storage={storage} storageLoading={storageLoading} logs={logs} logsLoading={logsLoading} />;
}
