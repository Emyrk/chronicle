import { useState } from "react";
import { Menu, FileText, Copy, Upload, Download, RotateCcw, LayoutGrid, Clock, Share2, Unlink, ExternalLink, BarChart3, Check, List, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAdminClearLogInvalidation, useAdminInvalidateLogs } from "@/api/queries";
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
} from "@/components/ui/DropdownMenu/DropdownMenu";
interface InstanceMenuProps {
  onImportLayout?: () => void;
  onExportLayout?: () => void;
  onPopOutLayout?: () => void;
  layoutPoppedOut?: boolean;
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
  canAdminLogs,
  canInvalidateLogs,
}: InstanceMenuProps) {
  const [showInvalidateConfirm, setShowInvalidateConfirm] = useState(false);
  const [showMarkValidConfirm, setShowMarkValidConfirm] = useState(false);
  const [invalidReason, setInvalidReason] = useState("");
  const invalidateLogs = useAdminInvalidateLogs();
  const clearInvalidation = useAdminClearLogInvalidation();
  const handleCopyInstanceId = async () => {
    try {
      await navigator.clipboard.writeText(instanceId);
      toast.success("Copied instance ID", { description: instanceId });
    } catch {
      toast.error("Failed to copy instance ID");
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
      const result = await invalidateLogs.mutateAsync({
        logIds: [logGroupId],
        instanceIds: [instanceId],
        reason,
      });
      if (result.failed.length > 0) {
        throw new Error(result.failed[0]?.detail || "Failed to invalidate log");
      }
      toast.success("Log invalidated", {
        description: "It remains visible, but no longer contributes parses or rankings.",
      });
      setShowInvalidateConfirm(false);
      setInvalidReason("");
    } catch (err) {
      toast.error("Failed to invalidate log", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleMarkValid = async () => {
    if (!logGroupId) return;

    try {
      const result = await clearInvalidation.mutateAsync({
        logIds: [logGroupId],
        instanceIds: [instanceId],
      });
      if (result.failed.length > 0) {
        throw new Error(result.failed[0]?.detail || "Failed to mark log valid");
      }
      toast.success("Log marked valid", {
        description: "Reparse the log to recreate rankings, parses, and speedrun results.",
      });
      setShowMarkValidConfirm(false);
    } catch (err) {
      toast.error("Failed to mark log valid", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

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
            onSelect={() => setShowInvalidateConfirm(true)}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="h-4 w-4 mr-2" />
            Invalidate log
          </DropdownMenuItem>
        )}

        {canInvalidateLogs && logGroupId && invalidated && (
          <DropdownMenuItem onSelect={() => setShowMarkValidConfirm(true)}>
            <Check className="h-4 w-4 mr-2" />
            Mark log valid
          </DropdownMenuItem>
        )}

        {logDetailUrl && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={logDetailUrl}>
                <FileText className="h-4 w-4 mr-2" />
                View Log
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={showInvalidateConfirm}
        onOpenChange={(open) => {
          if (invalidateLogs.isPending) return;
          setShowInvalidateConfirm(open);
          if (!open) setInvalidReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invalidate this log group?</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-semibold text-destructive">
            Existing parses, rankings, and speedrun results will be removed.
          </p>
          <DialogDescription>
            The log and its instances will remain visible and can be marked valid again later. Marking it valid will not restore removed data; reparse it afterward to rebuild normal results.
          </DialogDescription>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="font-medium">{instanceName}</span>
            <span className="ml-2 text-xs text-muted-foreground">{logGroupId}</span>
          </div>
          <div className="space-y-2">
            <label htmlFor="invalidate-log-reason" className="text-sm font-medium">
              Reason
            </label>
            <Input
              id="invalidate-log-reason"
              value={invalidReason}
              onChange={(event) => setInvalidReason(event.target.value)}
              placeholder="Describe why this log is invalid"
              disabled={invalidateLogs.isPending}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowInvalidateConfirm(false)}
              disabled={invalidateLogs.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleInvalidate()}
              disabled={invalidateLogs.isPending || invalidReason.trim() === ""}
            >
              {invalidateLogs.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Invalidate log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showMarkValidConfirm}
        onOpenChange={(open) => {
          if (clearInvalidation.isPending) return;
          setShowMarkValidConfirm(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this log group valid?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            This clears the invalid marker from the log and its instances. Previously removed parses, rankings, and speedrun results are not restored automatically.
          </DialogDescription>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="font-medium">{instanceName}</span>
            <span className="ml-2 text-xs text-muted-foreground">{logGroupId}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Reparse the log afterward to rebuild its normal ranking and parse data.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMarkValidConfirm(false)}
              disabled={clearInvalidation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleMarkValid()} disabled={clearInvalidation.isPending}>
              {clearInvalidation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Mark valid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
