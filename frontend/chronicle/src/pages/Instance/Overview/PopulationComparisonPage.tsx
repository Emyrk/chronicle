import { BarChart3 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { PopulationComparisonHeader } from "./PopulationComparisonHeader";

export function PopulationComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const primary = searchParams.get("primary") ?? undefined;
  const comparison = searchParams.get("comparison") ?? undefined;

  const setPopulation = (key: "primary" | "comparison", instanceID?: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (instanceID) next.set(key, instanceID);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  return (
    <main className="w-full px-4 py-6">
      <PopulationComparisonHeader
        showPrimary
        primary={primary}
        comparison={comparison}
        onPrimaryChange={(instanceID) => setPopulation("primary", instanceID)}
        onComparisonChange={(instanceID) => setPopulation("comparison", instanceID)}
      />

      <Card className="flex min-h-80 items-center justify-center border-dashed p-8 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border bg-muted/40">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <h1 className="font-semibold">Population comparison panels</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Choose ranked populations above. Shared comparison panels and rankings-backed data will be added next.
          </p>
        </div>
      </Card>
    </main>
  );
}
