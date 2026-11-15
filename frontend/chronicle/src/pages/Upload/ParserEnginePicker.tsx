import type { ParserEngine } from "@/api/typesGenerated";
import { Label } from "@/components/ui/label";

interface ParserEnginePickerProps {
  hasAdminLogs: boolean;
  value: ParserEngine;
  onChange?: (value: ParserEngine) => void;
  disabled?: boolean;
  context?: "upload" | "reparse";
}

/** Uses the effective admin_logs permission, not a user role or feature flag. */
export function ParserEnginePicker({ hasAdminLogs, value, onChange, disabled, context = "upload" }: ParserEnginePickerProps) {
  if (!hasAdminLogs) return null;

  return (
    <div className="space-y-2">
      <Label htmlFor="parser-engine" className="text-sm font-medium">Parser engine</Label>
      <select
        id="parser-engine"
        aria-describedby="parser-engine-description"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value === "parsernext" ? "parsernext" : "legacy")}
        className="block h-9 w-full sm:w-72 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        <option value="legacy">Legacy (default)</option>
        <option value="parsernext">Parsernext (experimental)</option>
      </select>
      <p id="parser-engine-description" className="text-xs text-muted-foreground">
        Admin only. Applies to this {context} attempt. Parsernext is experimental; legacy remains the default.
        {context === "reparse" && " Verbose includes identity details. Only verbose parsernext saves a snapshot."}
      </p>
    </div>
  );
}
