import { BarChart3 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { PopulationComparisonHeader } from "./PopulationComparisonHeader";
import { ClearTimePanel } from "./ClearTimePanel";
import {
  parsePopulationSelection,
  serializePopulationSelection,
  type PopulationSelection,
} from "./populationSelectionState";

export function PopulationComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const primary = parsePopulationSelection(searchParams.get("primary"));
  const comparison = parsePopulationSelection(searchParams.get("comparison"));

  const setPopulation = (key: "primary" | "comparison", selection?: PopulationSelection) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      const serialized = serializePopulationSelection(selection);
      if (serialized) next.set(key, serialized);
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
        onPrimaryChange={(selection) => setPopulation("primary", selection)}
        onComparisonChange={(selection) => setPopulation("comparison", selection)}
      />

      {primary ? (
        <ClearTimePanel primary={primary} comparison={comparison} />
      ) : (
        <Card className="flex min-h-80 items-center justify-center border-dashed p-8 text-center">
          <div className="max-w-md">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border bg-muted/40">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
            </div>
            <h1 className="font-semibold">Select a primary population</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Choose a ranked raid, server cohort, or guild cohort above.
            </p>
          </div>
        </Card>
      )}
    </main>
  );
}
