import { useState } from "react";
import { Play } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { useLogGroups, useMyStorage, useSiteConfig, type UserStorageInfo, type WoWLogGroup } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  /** Billing is on and the account has no supporter tier yet. */
  showSupporterCallout?: boolean;
}

export function StorageSettingsView({
  storage,
  storageLoading,
  logs,
  logsLoading,
  currentTenantName,
  showSupporterCallout = false,
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
        <>
          <StorageCallouts showDiscord={!hasDiscordMemberGrant(storage.grants)} showSupporter={showSupporterCallout} />
          <div className="grid gap-4 md:grid-cols-2">
            <RawStorageCard storage={storage} />
            <ParsedDataCard storage={storage} />
          </div>
        </>
      )}

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
      showSupporterCallout={!!siteConfig?.billing_enabled && !session?.ads_free}
    />
  );
}
