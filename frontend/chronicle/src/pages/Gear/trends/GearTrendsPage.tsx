import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";

export function GearTrendsPage() {
  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Observed equipment, not a recommendation</AlertTitle>
        <AlertDescription>
          Gear trends show the items logged players were actually wearing. Popularity does not
          measure upgrade value and does not prove an item caused higher performance.
        </AlertDescription>
      </Alert>
      <p className="text-sm text-zinc-500">
        Observed gear trends are coming soon: per-slot equip rates for a class and spec, built
        from recent ranked parses on this server.
      </p>
    </div>
  );
}
