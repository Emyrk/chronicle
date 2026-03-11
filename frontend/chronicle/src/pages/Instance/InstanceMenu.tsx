import { Menu, FileText, Copy, Upload, RotateCcw, LayoutGrid, Clock } from "lucide-react";
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
  onResetView?: () => void;
  onOpenTimeRange?: () => void;
  instanceId: string;
  logDetailUrl?: string;
  layoutLabUrl?: string;
}

export function InstanceMenu({
  onImportLayout,
  onResetView,
  onOpenTimeRange,
  instanceId,
  logDetailUrl,
  layoutLabUrl,
}: InstanceMenuProps) {
  const handleCopyInstanceId = async () => {
    try {
      await navigator.clipboard.writeText(instanceId);
      toast.success("Copied instance ID", { description: instanceId });
    } catch {
      toast.error("Failed to copy instance ID");
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
