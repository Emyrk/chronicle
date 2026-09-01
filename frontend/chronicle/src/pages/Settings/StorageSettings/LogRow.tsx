import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { TableCell, TableRow } from "@/components/Table/Table";
import { LogStatusBadge } from "./LogStatusBadge";
import type { LogRowViewModel } from "./types";

interface LogRowProps {
  row: LogRowViewModel;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onRequestDeleteRaw: () => void;
  onRequestDeleteParsed: () => void;
  onRequestDeleteEntire: () => void;
}

export function LogRow({
  row,
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
            <span className="text-sm font-medium">{row.instancesLabel}</span>
            <span className="text-xs text-muted-foreground">{row.server}</span>
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
