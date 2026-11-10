import { useState } from "react";
import { Menu, FileText, Copy, Upload, Download, RotateCcw, LayoutGrid, Clock, Share2, Unlink, ExternalLink, BarChart3, Check, List, Ban, Loader2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import type { WoWLogGroupState } from "@/api/typesGenerated";
import {
  useAdminClearEncounterInvalidation,
  useAdminClearInstanceInvalidation,
  useAdminInvalidateEncounter,
  useAdminInvalidateInstance,
} from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { InstanceViewMode } from "./instanceViewModeState";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuShortcut,
} from "@/components/ui/DropdownMenu/DropdownMenu";
interface InstanceMenuProps {
  onImportLayout?: () => void;
  onExportLayout?: () => void;
  onPopOutLayout?: () => void;
  layoutPoppedOut?: boolean;
  /** Enters layout Edit Mode; omitted when the layout can't be edited. */
  onEditLayout?: () => void;
  /** Opens the Save As drawer for the current layout. */
  onSaveLayout?: () => void;
  onResetView?: () => void;
  onOpenTimeRange?: () => void;
  instanceId: string;
  logDetailUrl?: string;
  layoutLabUrl?: string;
  /** Mobile-only props: show view selection and share actions inside the menu */
  isMobile?: boolean;
  viewMode?: InstanceViewMode;
  onViewModeChange?: (mode: InstanceViewMode) => void;
  isLoggedIn?: boolean;
  onShareWithLayout?: () => void;
  onShareWithoutLayout?: () => void;
  youtubeButton?: React.ReactNode;
  showHints?: boolean;
  onOpenHelp?: () => void;
  /** Show "Ungroup" option when instance is part of a duplicate group */
  duplicateGroupId?: string;
  logGroupId?: string;
  instanceName: string;
  invalidated?: boolean;
  selectedEncounter?: {
    id: string;
    name: string;
    invalidatedAt?: string;
  };
  /** Whether user has admin_logs permission */
  canAdminLogs?: boolean;
  /** Whether user has invalidate_logs permission */
  canInvalidateLogs?: boolean;
}

export function InstanceMenu({
  onImportLayout,
  onExportLayout,
  onPopOutLayout,
  layoutPoppedOut = false,
  onEditLayout,
  onSaveLayout,
  onResetView,
  onOpenTimeRange,
  instanceId,
  logDetailUrl,
  layoutLabUrl,
  isMobile,
  viewMode,
  onViewModeChange,
  isLoggedIn,
  onShareWithLayout,
  onShareWithoutLayout,
  duplicateGroupId,
  logGroupId,
  instanceName,
  invalidated = false,
  selectedEncounter,
  canAdminLogs,
  canInvalidateLogs,
}: InstanceMenuProps) {
  const [showInvalidateConfirm, setShowInvalidateConfirm] = useState(false);
  const [showMarkValidConfirm, setShowMarkValidConfirm] = useState(false);
  const [invalidationTarget, setInvalidationTarget] = useState<"instance" | "encounter">("instance");
  const [invalidReason, setInvalidReason] = useState("");
  const [isDownloadingLog, setIsDownloadingLog] = useState(false);
  const invalidateInstance = useAdminInvalidateInstance();
  const invalidateEncounter = useAdminInvalidateEncounter();
  const clearInstanceInvalidation = useAdminClearInstanceInvalidation();
  const clearEncounterInvalidation = useAdminClearEncounterInvalidation();
  const invalidationPending = invalidateInstance.isPending || invalidateEncounter.isPending;
  const clearInvalidationPending = clearInstanceInvalidation.isPending || clearEncounterInvalidation.isPending;
  const handleCopyInstanceId = async () => {
    try {
      await navigator.clipboard.writeText(instanceId);
      toast.success("Copied instance ID", { description: instanceId });
    } catch {
      toast.error("Failed to copy instance ID");
    }
  };

  const handleDownloadLog = async () => {
    if (!logGroupId || isDownloadingLog) return;

    setIsDownloadingLog(true);
    try {
      const response = await fetch(`/api/v1/raidlogs/logs/${logGroupId}`);
      if (!response.ok) throw new Error("Failed to load log details");

      const log = await response.json() as WoWLogGroupState;
      if (log.files.length !== 1) {
        const description = log.files.length === 0
          ? "This log has no files to download."
          : `This log has ${log.files.length} files. Download them individually from the log detail page.`;
        toast.error("Cannot download log", { description });
        return;
      }

      const link = document.createElement("a");
      link.href = `/api/v1/raidlogs/logs/${logGroupId}/download`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error("Failed to download log", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsDownloadingLog(false);
    }
  };

  const handleUngroup = async () => {
    try {
      const response = await fetch(`/api/v1/raidlogs/instances/${instanceId}/duplicate-group`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to ungroup");
      toast.success("Instance removed from duplicate group");
    } catch {
      toast.error("Failed to ungroup instance");
    }
  };

  const handleInvalidate = async () => {
    const reason = invalidReason.trim();
    if (!logGroupId || !reason) return;

    try {
      if (invalidationTarget === "encounter" && selectedEncounter) {
        await invalidateEncounter.mutateAsync({
          logGroupId,
          instanceId,
          encounterId: selectedEncounter.id,
          reason,
        });
      } else {
        await invalidateInstance.mutateAsync({ logGroupId, instanceId, reason });
      }
      const targetLabel = invalidationTarget === "encounter" ? "Encounter" : "Raid instance";
      toast.success(`${targetLabel} invalidated`, {
        description: "It remains visible, but no longer contributes affected parses or rankings.",
      });
      setShowInvalidateConfirm(false);
      setInvalidReason("");
    } catch (err) {
      toast.error(`Failed to invalidate ${invalidationTarget}`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleMarkValid = async () => {
    if (!logGroupId) return;

    try {
      if (invalidationTarget === "encounter" && selectedEncounter) {
        await clearEncounterInvalidation.mutateAsync({
          logGroupId,
          instanceId,
          encounterId: selectedEncounter.id,
        });
      } else {
        await clearInstanceInvalidation.mutateAsync({ logGroupId, instanceId });
      }
      const targetLabel = invalidationTarget === "encounter" ? "Encounter" : "Raid instance";
      toast.success(`${targetLabel} marked valid`, {
        description: "Reparse the log to recreate removed rankings and parse results.",
      });
      setShowMarkValidConfirm(false);
    } catch (err) {
      toast.error(`Failed to mark ${invalidationTarget} valid`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const targetKind = invalidationTarget === "encounter" ? "encounter" : "raid instance";
  const targetName = invalidationTarget === "encounter" && selectedEncounter
    ? selectedEncounter.name
    : instanceName;

  return (
    <>
      <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Menu className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isMobile && viewMode && onViewModeChange && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">View</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onViewModeChange("encounters")}>
              <List className="h-4 w-4 mr-2" />
              Encounters
              {viewMode === "encounters" && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewModeChange("overview")}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
              <span className="ml-1 rounded-sm border border-amber-400/35 bg-amber-400/10 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-amber-400">
                Beta
              </span>
              {viewMode === "overview" && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {isMobile && onShareWithLayout && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Share</DropdownMenuLabel>
            <DropdownMenuItem onClick={onShareWithLayout} disabled={!isLoggedIn}>
              <Share2 className="h-4 w-4 mr-2" />
              Share with layout
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onShareWithoutLayout} disabled={!isLoggedIn}>
              <Share2 className="h-4 w-4 mr-2" />
              Share without layout
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {onResetView && (
          <>
            <DropdownMenuItem onClick={onResetView}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset View
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {onOpenTimeRange && (
          <DropdownMenuItem onClick={onOpenTimeRange}>
            <Clock className="h-4 w-4 mr-2" />
            Time Range
          </DropdownMenuItem>
        )}

        {/* Layout section */}
        <DropdownMenuLabel className="text-xs text-muted-foreground">Actions</DropdownMenuLabel>
        {onEditLayout && (
          <DropdownMenuItem onClick={onEditLayout}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Layout
            <DropdownMenuShortcut>⇧E</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {onSaveLayout && (
          <DropdownMenuItem onClick={onSaveLayout}>
            <Save className="h-4 w-4 mr-2" />
            Save Layout…
          </DropdownMenuItem>
        )}
        {onImportLayout && (
          <DropdownMenuItem onClick={onImportLayout}>
            <Upload className="h-4 w-4 mr-2" />
            Import Layout
          </DropdownMenuItem>
        )}
        {onExportLayout && (
          <DropdownMenuItem onClick={onExportLayout}>
            <Download className="h-4 w-4 mr-2" />
            Export Layout
          </DropdownMenuItem>
        )}
        {layoutLabUrl && (
          <DropdownMenuItem asChild>
            <a href={layoutLabUrl} target="_blank" rel="noopener noreferrer">
              <LayoutGrid className="h-4 w-4 mr-2" />
              View layout
            </a>
          </DropdownMenuItem>
        )}
        {onPopOutLayout && (
          <DropdownMenuItem onClick={onPopOutLayout} disabled={isMobile}>
            <ExternalLink className="h-4 w-4 mr-2" />
            {layoutPoppedOut ? "Focus popped-out layout" : "Pop out layout"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyInstanceId}>
          <Copy className="h-4 w-4 mr-2" />
          Copy Instance ID
        </DropdownMenuItem>

        {canAdminLogs && duplicateGroupId && (
          <DropdownMenuItem onClick={handleUngroup}>
            <Unlink className="h-4 w-4 mr-2" />
            Ungroup from duplicates
          </DropdownMenuItem>
        )}

        {canInvalidateLogs && logGroupId && !invalidated && (
          <DropdownMenuItem
            onSelect={() => {
              setInvalidationTarget("instance");
              setShowInvalidateConfirm(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="h-4 w-4 mr-2" />
            Invalidate raid instance
          </DropdownMenuItem>
        )}

        {canInvalidateLogs && logGroupId && invalidated && (
          <DropdownMenuItem onSelect={() => {
            setInvalidationTarget("instance");
            setShowMarkValidConfirm(true);
          }}>
            <Check className="h-4 w-4 mr-2" />
            Mark raid instance valid
          </DropdownMenuItem>
        )}

        {canInvalidateLogs && logGroupId && selectedEncounter && !selectedEncounter.invalidatedAt && (
          <DropdownMenuItem
            onSelect={() => {
              setInvalidationTarget("encounter");
              setShowInvalidateConfirm(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="h-4 w-4 mr-2" />
            Invalidate selected encounter
          </DropdownMenuItem>
        )}

        {canInvalidateLogs && logGroupId && selectedEncounter?.invalidatedAt && (
          <DropdownMenuItem onSelect={() => {
            setInvalidationTarget("encounter");
            setShowMarkValidConfirm(true);
          }}>
            <Check className="h-4 w-4 mr-2" />
            Mark selected encounter valid
          </DropdownMenuItem>
        )}

        {(logDetailUrl || (canAdminLogs && logGroupId)) && (
          <>
            <DropdownMenuSeparator />
            {logDetailUrl && (
              <DropdownMenuItem asChild>
                <Link to={logDetailUrl}>
                  <FileText className="h-4 w-4 mr-2" />
                  View Log
                </Link>
              </DropdownMenuItem>
            )}
            {canAdminLogs && logGroupId && (
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void handleDownloadLog();
                }}
                disabled={isDownloadingLog}
              >
                {isDownloadingLog ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download Log
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={showInvalidateConfirm}
        onOpenChange={(open) => {
          if (invalidationPending) return;
          setShowInvalidateConfirm(open);
          if (!open) setInvalidReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invalidate this {targetKind}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-semibold text-destructive">
            Affected parses and rankings will be removed.
          </p>
          <DialogDescription>
            The {targetKind} will remain visible. A later reparse recreates it without this manual invalidation marker.
          </DialogDescription>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="font-medium">{targetName}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {invalidationTarget === "encounter" ? selectedEncounter?.id : instanceId}
            </span>
          </div>
          <div className="space-y-2">
            <label htmlFor="invalidate-log-reason" className="text-sm font-medium">
              Reason
            </label>
            <Input
              id="invalidate-log-reason"
              value={invalidReason}
              onChange={(event) => setInvalidReason(event.target.value)}
              placeholder={`Describe why this ${targetKind} is invalid`}
              disabled={invalidationPending}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowInvalidateConfirm(false)}
              disabled={invalidationPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleInvalidate()}
              disabled={invalidationPending || invalidReason.trim() === ""}
            >
              {invalidationPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Invalidate {targetKind}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showMarkValidConfirm}
        onOpenChange={(open) => {
          if (clearInvalidationPending) return;
          setShowMarkValidConfirm(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this {targetKind} valid?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            This clears the invalid marker. Previously removed parses and rankings are not restored automatically.
          </DialogDescription>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="font-medium">{targetName}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {invalidationTarget === "encounter" ? selectedEncounter?.id : instanceId}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Reparse the log afterward to rebuild its normal ranking and parse data.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMarkValidConfirm(false)}
              disabled={clearInvalidationPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleMarkValid()} disabled={clearInvalidationPending}>
              {clearInvalidationPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Mark valid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
