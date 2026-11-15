import { Flame } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/DropdownMenu/DropdownMenu";
import type { ReactNode } from "react";
import type { ParserEngine } from "@/api/typesGenerated";
import { ParserEnginePicker } from "../Upload/ParserEnginePicker";

interface AdminReparseControlsProps {
  /** Effective chronicle#admin_logs authorization; unresolved is denied. */
  hasAdminLogs?: boolean;
  canReparse: boolean;
  parserEngine: ParserEngine;
  onParserEngineChange: (engine: ParserEngine) => void;
  disabled: boolean;
  children: ReactNode;
}

/** Content-sized tools below the header; neither help nor actions stretch the title. */
export function AdminReparseControls({ hasAdminLogs = false, canReparse, parserEngine, onParserEngineChange, disabled, children }: AdminReparseControlsProps) {
  if (!hasAdminLogs || !canReparse) return null;

  return (
    <section aria-label="Admin parser tools" className="w-fit max-w-full min-w-0 rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Admin parser tools</div>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <div className="min-w-0">
          <ParserEnginePicker compact context="reparse" hasAdminLogs={hasAdminLogs} value={parserEngine} onChange={onParserEngineChange} disabled={disabled} />
        </div>
        <div className="flex w-fit max-w-full flex-wrap items-center gap-2">{children}</div>
      </div>
      <details className="mt-2 max-w-lg text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer hover:text-foreground">About verbose parsing</summary>
        <p className="mt-1">
          Legacy is the default. Engine selection applies only to this attempt.
          Verbose includes identity details; only verbose parsernext saves a snapshot.
          Parsernext is experimental.
        </p>
      </details>
    </section>
  );
}


export function AdminProfileMenuItem({ parserEngine, onSelect }: { parserEngine: ParserEngine; onSelect: () => void }) {
  const requiresLegacy = parserEngine !== "legacy";
  return <DropdownMenuItem disabled={requiresLegacy} onSelect={requiresLegacy ? undefined : onSelect} className="flex flex-col items-start gap-1">
    <span className="flex items-center"><Flame className="h-4 w-4 mr-2 text-orange-500" />Reparse (CPU Profile)</span>
    {requiresLegacy && <span className="text-xs">CPU profiling currently requires Legacy</span>}
  </DropdownMenuItem>;
}
