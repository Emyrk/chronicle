import { Menu, LayoutGrid, Rows3, FileText, Copy, Upload, SquareTerminal } from "lucide-react";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import type { LayoutType } from "@/hooks/useUrlState";

interface InstanceMenuProps {
  layout: LayoutType;
  onLayoutChange: (layout: LayoutType) => void;
  onImportLayout?: () => void;
  onOpenLayoutActionBar?: () => void;
  instanceId: string;
  logDetailUrl?: string;
}

export function InstanceMenu({
  layout,
  onLayoutChange,
  onImportLayout,
  onOpenLayoutActionBar,
  instanceId,
  logDetailUrl,
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
        {/* Layout section */}
        <DropdownMenuLabel className="text-xs text-muted-foreground">Layout</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={layout} onValueChange={(v) => onLayoutChange(v as LayoutType)}>
          <DropdownMenuRadioItem value="standard">
            <LayoutGrid className="h-4 w-4 mr-2" />
            Standard (2×2 + 1)
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="alternate">
            <Rows3 className="h-4 w-4 mr-2" />
            Alternate (1+1 + 2×1)
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        {onImportLayout && (
          <DropdownMenuItem onClick={onImportLayout}>
            <Upload className="h-4 w-4 mr-2" />
            Import Layout
          </DropdownMenuItem>
        )}

        {onOpenLayoutActionBar && (
          <DropdownMenuItem onClick={onOpenLayoutActionBar}>
            <SquareTerminal className="h-4 w-4 mr-2" />
            Open Layout Action Bar
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
