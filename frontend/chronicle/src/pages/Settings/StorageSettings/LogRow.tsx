import { ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { TableCell, TableRow } from "@/components/Table/Table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { LogStatusBadge } from "./LogStatusBadge";
import type { LogRowViewModel } from "./types";

interface LogRowProps {
  row: LogRowViewModel;
  currentTenantName: string | null;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onRequestDeleteRaw: () => void;
  onRequestDeleteParsed: () => void;
  onRequestDeleteEntire: () => void;
}

export function LogRow({
  row,
  currentTenantName,
  onToggleSelect,
  onToggleExpand,
  onRequestDeleteRaw,
  onRequestDeleteParsed,
  onRequestDeleteEntire,
}: LogRowProps) {
  return (
    <>
      <TableRow>
        <TableCell>
          <Checkbox checked={row.isSelected} onCheckedChange={() => onToggleSelect(row.id)} />
        </TableCell>
        <TableCell>
          <div className="flex cursor-pointer flex-col" onClick={() => onToggleExpand(row.id)}>
            <span className="truncate text-sm font-medium" title={row.instancesFullLabel}>
              {row.instancesLabel}
            </span>
            {row.tenantMismatch ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block w-fit rounded px-1 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-500">
                      {row.server}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="w-64">
                    This log is from {row.tenantName}, not {currentTenantName} — the community you're currently
                    viewing.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="text-xs text-muted-foreground">{row.server}</span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <LogStatusBadge status={row.status} />
        </TableCell>
        <TableCell>
          <span className="text-sm text-muted-foreground">{row.uploadDateLabel}</span>
        </TableCell>
        <TableCell>
          <span className="text-sm">{row.storedLabel}</span>
        </TableCell>
        <TableCell>
          <span className="text-sm">{row.parsedLabel}</span>
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <a
              href={`/logs/${row.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open log page in a new tab"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="size-4" />
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <span className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
                  ⋯
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onToggleExpand(row.id)}>View details</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={row.rawDeleteDisabled || !row.canDeleteFiles} onClick={onRequestDeleteRaw}>
                  Delete raw files
                </DropdownMenuItem>
                <DropdownMenuItem disabled={row.parsedDeleteDisabled || !row.canDelete} onClick={onRequestDeleteParsed}>
                  Delete parsed data
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={!row.canDelete} onClick={onRequestDeleteEntire}>
                  Delete entire log
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
      {row.isExpanded && (
        <TableRow>
          <TableCell colSpan={7}>
            <div className="flex flex-col gap-2 rounded-md bg-muted p-4 text-xs text-muted-foreground">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="text-sm font-medium text-foreground">{row.originalLabel}</div>
                  <div>Original size</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{row.compressionLabel}</div>
                  <div>Compression savings</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {row.activeFileCount} active, {row.deletedFileCount} deleted
                  </div>
                  <div>Raw files</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{row.encounterCount}</div>
                  <div>Encounters parsed</div>
                </div>
              </div>
              {row.note && <p className="border-t border-border pt-2">{row.note}</p>}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
