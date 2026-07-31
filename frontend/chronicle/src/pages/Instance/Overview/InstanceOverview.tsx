import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { SpeedrunResult } from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";
import type { Instance } from "../InstancePage";
import { PopulationComparisonHeader } from "./PopulationComparisonHeader";

export function InstanceOverview({ instance }: { instance: Instance }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const comparison = searchParams.get("comparison") ?? undefined;

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
      <PopulationComparisonHeader
        heading="Overview"
        comparison={comparison}
        comparisonEligible={speedrun !== null && speedrun !== undefined}
        eligibilityLoading={isLoading}
        onComparisonChange={(instanceID) => {
          setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            if (instanceID) next.set("comparison", instanceID);
            else next.delete("comparison");
            return next;
          }, { replace: true });
        }}
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
