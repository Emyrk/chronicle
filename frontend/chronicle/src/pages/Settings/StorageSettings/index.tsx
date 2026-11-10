import { useState } from "react";
import { Play, ShieldCheck } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useLogGroups, useMyStorage, useSiteConfig, type UserStorageInfo, type WoWLogGroup } from "@/api/queries";
import { useUpdateAutoDeleteRawLogsPreference } from "@/api/storagePreferences";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/Switch/Switch";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { cn } from "@/lib/utils";
import { DiscordGrantCallout } from "./DiscordGrantCallout";
import { SupporterStorageCallout } from "./SupporterStorageCallout";
import { hasDiscordMemberGrant } from "./grantMath";
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
  autoDeleteRawLogsAtStorageCapacity?: boolean;
  /** Billing is on and the account has no supporter tier yet. */
  showSupporterCallout?: boolean;
}

export function StorageSettingsView({
  storage,
  storageLoading,
  logs,
  logsLoading,
  currentTenantName,
  autoDeleteRawLogsAtStorageCapacity = true,
  showSupporterCallout = false,
}: StorageSettingsViewProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const updateAutoDelete = useUpdateAutoDeleteRawLogsPreference();
  const autoDeleteEnabled = updateAutoDelete.isPending && updateAutoDelete.variables !== undefined
    ? updateAutoDelete.variables
    : autoDeleteRawLogsAtStorageCapacity;

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
        <>
          <StorageCallouts showDiscord={!hasDiscordMemberGrant(storage.grants)} showSupporter={showSupporterCallout} />
          <div className="grid gap-4 md:grid-cols-2">
            <RawStorageCard storage={storage} />
            <ParsedDataCard storage={storage} />
          </div>
        </>
      )}

      <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Automatically prevent storage from filling up</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              When an upload would exceed your limit, delete the oldest unpinned raw files that have finished parsing.
              Parsed reports stay available. Pin any raw log you need to keep.
            </p>
          </div>
        </div>
        <Switch
          checked={autoDeleteEnabled}
          disabled={updateAutoDelete.isPending}
          aria-label="Automatically delete old raw logs when storage is full"
          onCheckedChange={(enabled) => {
            updateAutoDelete.mutate(enabled, {
              onSuccess: () => toast.success(enabled ? "Automatic storage cleanup enabled" : "Automatic storage cleanup disabled"),
              onError: (error) => toast.error("Failed to update storage cleanup", { description: error.message }),
            });
          }}
        />
      </div>

      {logsLoading || !logs ? (
        <p className="text-sm text-muted-foreground">Loading your logs...</p>
      ) : (
        <LogsTable logs={logs} currentTenantName={currentTenantName} onRequestDelete={setPendingAction} />
      )}

      {pendingAction && <DeleteConfirmDialog action={pendingAction} onClose={() => setPendingAction(null)} />}

      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="max-w-6xl">
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

/** Ways to get more storage; side by side when both apply, full width when only one does. */
function StorageCallouts({ showDiscord, showSupporter }: { showDiscord: boolean; showSupporter: boolean }) {
  if (!showDiscord && !showSupporter) return null;
  const both = showDiscord && showSupporter;
  return (
    <div className={cn("grid gap-4", both && "md:grid-cols-2")}>
      {showDiscord && <DiscordGrantCallout compact={both} />}
      {showSupporter && <SupporterStorageCallout compact={both} />}
    </div>
  );
}

export function StorageSettings() {
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading, session } = useAuth();
  const { data: storage, isLoading: storageLoading } = useMyStorage({ enabled: isAuthenticated });
  const { data: logs, isLoading: logsLoading } = useLogGroups({
    allTenants: true,
    enabled: isAuthenticated,
  });
  const { data: siteConfig } = useSiteConfig();

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Checking your session...</p>;
  }

  if (!isAuthenticated) {
    const returnPath = location.pathname + location.search;
    return <Navigate to={`/login?from=${encodeURIComponent(returnPath)}`} replace />;
  }

  return (
    <StorageSettingsView
      storage={storage}
      storageLoading={storageLoading}
      logs={logs}
      logsLoading={logsLoading}
      currentTenantName={siteConfig?.tenant?.name ?? null}
      autoDeleteRawLogsAtStorageCapacity={session?.preferences.auto_delete_raw_logs_at_storage_capacity ?? true}
      showSupporterCallout={!!siteConfig?.billing_enabled && !session?.ads_free}
    />
  );
}
