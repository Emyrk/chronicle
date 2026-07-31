import { ArrowLeftRight, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatInstancePopulation, parseInstanceURL } from "./populationSelectionState";
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

interface PopulationSelectorProps {
  label: string;
  value?: string;
  allowNone?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: (instanceID?: string) => void;
}

function PopulationSelector({
  label,
  value,
  allowNone = false,
  disabled = false,
  className,
  onChange,
}: PopulationSelectorProps) {
  const buttonLabel = value ?? (allowNone ? "No comparison" : "Select population");

  const selectInstanceURL = () => {
    const raw = window.prompt("Paste a Chronicle instance URL");
    if (!raw) return;

    const instanceID = parseInstanceURL(raw);
    if (!instanceID) {
      toast.error("Invalid instance URL", {
        description: "Use a Chronicle URL with the path /instances/<id>.",
      });
      return;
    }

    onChange?.(instanceID);
  };

  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between gap-3 bg-background/50 sm:min-w-52"
            disabled={disabled}
          >
            <span className="truncate">{buttonLabel}</span>
            {disabled ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuRadioGroup value={value ? "selected" : allowNone ? "none" : ""}>
            {allowNone && (
              <DropdownMenuRadioItem value="none" onSelect={() => onChange?.(undefined)}>
                No comparison
              </DropdownMenuRadioItem>
            )}
            {allowNone && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Ranked populations
            </DropdownMenuLabel>
            <DropdownMenuRadioItem
              value="instance"
              disabled={!onChange}
              onSelect={selectInstanceURL}
            >
              Specific raid URL
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="server" disabled>
              Server cohort
              <DropdownMenuShortcut>60 days</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="guild" disabled>
              Guild or team cohort
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <p className="px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
            Population configuration will be connected to rankings data in the next phase.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function PopulationComparisonHeader({
  primary,
  comparison,
  showPrimary = false,
  comparisonEligible = true,
  eligibilityLoading = false,
  onPrimaryChange,
  onComparisonChange,
}: {
  primary?: string;
  comparison?: string;
  showPrimary?: boolean;
  comparisonEligible?: boolean;
  eligibilityLoading?: boolean;
  onPrimaryChange?: (instanceID?: string) => void;
  onComparisonChange?: (instanceID?: string) => void;
}) {
  if (!showPrimary && !eligibilityLoading && !comparisonEligible) return null;

  return (
    <Card className="mb-4 p-4">
      <div className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end",
        !showPrimary && "sm:justify-end",
      )}>
        {showPrimary && (
          <PopulationSelector
            label="Primary population"
            value={primary ? formatInstancePopulation(primary) : undefined}
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
            value={comparison ? formatInstancePopulation(comparison) : undefined}
            allowNone
            disabled={eligibilityLoading}
            className={showPrimary ? undefined : "sm:max-w-sm sm:flex-none"}
            onChange={onComparisonChange}
          />
        )}
      </div>
    </Card>
  );
}
