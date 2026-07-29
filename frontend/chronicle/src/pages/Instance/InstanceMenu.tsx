import { Menu, FileText, Copy, Upload, Download, RotateCcw, LayoutGrid, Clock, Share2, Unlink, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
  /** Mobile-only props: show share/help/video inside the menu */
  isMobile?: boolean;
  isLoggedIn?: boolean;
  onShareWithLayout?: () => void;
  onShareWithoutLayout?: () => void;
  youtubeButton?: React.ReactNode;
  showHints?: boolean;
  onOpenHelp?: () => void;
  /** Show "Ungroup" option when instance is part of a duplicate group */
  duplicateGroupId?: string;
  /** Whether user has admin_logs permission */
  canAdminLogs?: boolean;
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
  isLoggedIn,
  onShareWithLayout,
  onShareWithoutLayout,
  duplicateGroupId,
  canAdminLogs,
}: InstanceMenuProps) {
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

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Menu className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
        {onPopOutLayout && (
          <DropdownMenuItem onClick={onPopOutLayout}>
            <ExternalLink className="h-4 w-4 mr-2" />
            {layoutPoppedOut ? "Focus popped-out layout" : "Pop out layout"}
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
  );
}
