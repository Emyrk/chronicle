import type { UserStorageInfo } from "@/api/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { formatBytes } from "@/lib/format";

export function ParsedDataCard({ storage }: { storage: UserStorageInfo }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parsed data</CardTitle>
        <CardDescription>Does not count against your limit</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{formatBytes(storage.parsed_storage_bytes)}</span>
          <span className="text-sm text-muted-foreground">
            across {storage.parsed_instance_count} parsed instance{storage.parsed_instance_count === 1 ? "" : "s"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Parsed data powers your instance reports, rankings, and leaderboards. It does not count against your
          storage allowance and is not currently limited.
        </p>
        <p className="text-xs text-muted-foreground pt-3 border-t border-border">
          Measures parsed event data only — the compressed combat-log event stream behind each report. It does not
          include the related database records (encounters, players, summaries).
        </p>
      </CardContent>
    </Card>
  );
}
