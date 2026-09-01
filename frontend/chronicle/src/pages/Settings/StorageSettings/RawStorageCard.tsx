import { useState } from "react";
import type { UserStorageInfo } from "@/api/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/Collapsible/Collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { formatBytes, formatExpirationDate, formatSource } from "@/lib/format";
import { buildForecastSentence } from "./grantMath";

/** Usage-severity color for the bar fill and the "% used" text: <70% green, 70-90% yellow, 90-100% orange, 100%+ red. */
function usageColorClasses(percent: number): { bar: string; text: string } {
  if (percent >= 100) return { bar: "bg-red-500", text: "text-red-500" };
  if (percent >= 90) return { bar: "bg-orange-500", text: "text-orange-500" };
  if (percent >= 70) return { bar: "bg-yellow-500", text: "text-yellow-500" };
  return { bar: "bg-green-500", text: "text-green-500" };
}

export function RawStorageCard({ storage }: { storage: UserStorageInfo }) {
  const [grantsOpen, setGrantsOpen] = useState(false);

  const usagePercent = storage.max_storage_bytes > 0
    ? (storage.consumed_storage_bytes / storage.max_storage_bytes) * 100
    : 0;
  const barWidth = Math.max(0.5, Math.min(100, usagePercent));
  const availableBytes = storage.max_storage_bytes - storage.consumed_storage_bytes;
  const forecast = buildForecastSentence(storage.grants, storage.consumed_storage_bytes);
  const { bar: barColor, text: textColor } = usageColorClasses(usagePercent);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raw file storage</CardTitle>
        <CardDescription>Counts against your storage limit</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold">{formatBytes(storage.consumed_storage_bytes)}</span>
          <span className="text-sm text-muted-foreground">of {formatBytes(storage.max_storage_bytes)}</span>
        </div>
        <div className="h-2 rounded-full bg-muted-foreground/25 overflow-hidden">
          <div className={`h-full ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={`font-medium ${textColor}`}>
            {usagePercent.toFixed(2)}% used
            {availableBytes < 0 && ` (${formatBytes(-availableBytes)} over limit)`}
          </span>
          <span className="text-muted-foreground">
            {availableBytes >= 0 ? `${formatBytes(availableBytes)} available` : `${formatBytes(-availableBytes)} over limit`}
          </span>
        </div>
        <p className="text-sm text-muted-foreground pt-3 border-t border-border">
          Raw files use your storage allowance. You can delete raw files after Chronicle parses them and keep the
          parsed reports. Raw files are still needed to investigate parser problems or re-parse the log later.
        </p>

        <Collapsible open={grantsOpen} onOpenChange={setGrantsOpen}>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>
                From {storage.grants.length} grant{storage.grants.length === 1 ? "" : "s"}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex size-3.5 cursor-default items-center justify-center rounded-full border border-current text-[9px]">
                      ?
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="w-60">{forecast}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost">
                {grantsOpen ? "Hide details" : "Show details"}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="mt-2 flex flex-col rounded-md bg-muted px-3">
              {storage.grants.length === 0 ? (
                <div className="py-3 text-sm text-muted-foreground">No storage grants found.</div>
              ) : (
                storage.grants.map((grant) => (
                  <div key={grant.id} className="flex items-center justify-between border-b border-border py-3 last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatSource(grant.source)}</span>
                        {grant.expires_at && (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                            {formatExpirationDate(grant.expires_at)}
                          </span>
                        )}
                      </div>
                      {grant.description && <p className="mt-0.5 text-xs text-muted-foreground">{grant.description}</p>}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{formatBytes(grant.storage_bytes)}</div>
                      <div className="text-xs text-muted-foreground">Granted {new Date(grant.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
