import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, Layers3, Loader2 } from "lucide-react";
import type { SpeedrunResult } from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import type { Instance } from "../InstancePage";

function OverviewHeader({
  encounterCount,
  comparisonEligible,
  eligibilityLoading,
}: {
  encounterCount: number;
  comparisonEligible: boolean;
  eligibilityLoading: boolean;
}) {
  return (
    <Card className="mb-4 overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted/35">
            <Layers3 className="h-5 w-5 text-amber-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Reporting scope
            </p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="font-semibold">Entire raid</h2>
              <span className="text-xs text-muted-foreground">
                {encounterCount} {encounterCount === 1 ? "encounter" : "encounters"} included
              </span>
            </div>
          </div>
        </div>

        {eligibilityLoading ? (
          <div className="flex h-9 items-center gap-2 px-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking comparisons
          </div>
        ) : comparisonEligible ? (
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-xs font-medium text-muted-foreground">Compare against</span>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="min-w-40 justify-between gap-3">
                  No comparison
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuRadioGroup value="none">
                  <DropdownMenuRadioItem value="none">No comparison</DropdownMenuRadioItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Population comparisons
                  </DropdownMenuLabel>
                  <DropdownMenuRadioItem value="server" disabled>
                    Server median
                    <DropdownMenuShortcut>60 days</DropdownMenuShortcut>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="guild" disabled>
                    Guild performance
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="instance" disabled>
                    Specific raid URL
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <p className="px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
                  Comparison data will be connected in the next phase.
                </p>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function InstanceOverview({ instance }: { instance: Instance }) {
  const { data: speedrun, isLoading } = useQuery({
    queryKey: ["instance-speedrun", instance.id],
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/instances/${encodeURIComponent(instance.id)}/speedrun`);
      if (!response.ok) return null;
      return response.json() as Promise<SpeedrunResult>;
    },
    staleTime: Infinity,
    retry: false,
  });

  return (
    <section className="min-w-0 flex-1" aria-label="Instance overview">
      <OverviewHeader
        encounterCount={instance.encounters.length}
        comparisonEligible={speedrun !== null && speedrun !== undefined}
        eligibilityLoading={isLoading}
      />

      <Card className="flex min-h-72 items-center justify-center border-dashed p-8 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border bg-muted/40">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">Overview panels</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Population comparisons and the first whole-raid panels will be added here next.
          </p>
        </div>
      </Card>
    </section>
  );
}
