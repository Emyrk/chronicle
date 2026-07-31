import { ArrowLeftRight } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { cn } from "@/lib/utils";
import type { PopulationSelection } from "./populationSelectionState";
import { PopulationSelector } from "./PopulationSelector";


export function PopulationComparisonHeader({
  primary,
  comparison,
  heading,
  description,
  showPrimary = false,
  comparisonEligible = true,
  eligibilityLoading = false,
  guildAvailable = true,
  fixedAnchorInstanceId,
  onPrimaryChange,
  onComparisonChange,
}: {
  primary?: PopulationSelection;
  comparison?: PopulationSelection;
  heading?: string;
  description?: string;
  showPrimary?: boolean;
  comparisonEligible?: boolean;
  eligibilityLoading?: boolean;
  guildAvailable?: boolean;
  fixedAnchorInstanceId?: string;
  onPrimaryChange?: (selection?: PopulationSelection) => void;
  onComparisonChange?: (selection?: PopulationSelection) => void;
}) {
  if (!heading && !showPrimary && !eligibilityLoading && !comparisonEligible) return null;

  return (
    <Card className="mb-4 p-4 sm:pr-6">
      <div className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end",
        !showPrimary && "sm:justify-between",
      )}>
        {heading && (
          <div className="flex min-h-9 flex-col justify-center">
            <h2 className="text-lg font-semibold">{heading}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        )}
        {showPrimary && (
          <PopulationSelector
            label="Primary population"
            value={primary}
            onChange={onPrimaryChange}
          />
        )}
        {showPrimary && (
          <div className="hidden h-9 items-center px-1 text-muted-foreground sm:flex">
            <ArrowLeftRight className="h-4 w-4" />
          </div>
        )}
        {(comparisonEligible || eligibilityLoading || showPrimary) && (
          <PopulationSelector
            label="Compare against"
            value={comparison}
            allowNone
            disabled={eligibilityLoading}
            guildAvailable={guildAvailable}
            fixedAnchorInstanceId={fixedAnchorInstanceId}
            className={showPrimary ? undefined : "sm:max-w-sm sm:flex-none"}
            onChange={onComparisonChange}
          />
        )}
      </div>
    </Card>
  );
}
