import { ArrowLeftRight, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatPopulationSelection,
  parseInstanceURL,
  type PopulationSelection,
} from "./populationSelectionState";
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
  value?: PopulationSelection;
  allowNone?: boolean;
  disabled?: boolean;
  guildAvailable?: boolean;
  fixedAnchorInstanceId?: string;
  className?: string;
  compact?: boolean;
  onChange?: (selection?: PopulationSelection) => void;
}

export function PopulationSelector({
  label,
  value,
  allowNone = false,
  disabled = false,
  guildAvailable = true,
  fixedAnchorInstanceId,
  className,
  compact = false,
  onChange,
}: PopulationSelectorProps) {
  const buttonLabel = value
    ? formatPopulationSelection(value)
    : allowNone ? "No comparison" : "Select population";

  const requestAnchorInstance = (prompt: string): string | null => {
    const raw = window.prompt(prompt);
    if (!raw) return null;

    const instanceID = parseInstanceURL(raw);
    if (!instanceID) {
      toast.error("Invalid instance URL", {
        description: "Use a Chronicle URL with the path /instances/<id>.",
      });
      return null;
    }

    return instanceID;
  };

  const selectInstanceURL = () => {
    const instanceID = requestAnchorInstance("Paste a Chronicle instance URL");
    if (instanceID) onChange?.({ kind: "instance", instanceId: instanceID });
  };

  const selectCohort = (scope: "server" | "guild") => {
    const anchorInstanceId = fixedAnchorInstanceId
      ?? requestAnchorInstance(`Paste an instance URL from the ${scope} population`);
    if (!anchorInstanceId) return;
    onChange?.({ kind: "cohort", scope, anchorInstanceId, lookbackDays: 60 });
  };

  return (
    <div className={cn(compact ? "shrink-0" : "min-w-0 flex-1", className)}>
      {!compact && (
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-between gap-3 bg-background/50",
              compact ? "h-8 w-auto px-3 text-xs" : "w-full sm:min-w-52",
            )}
            disabled={disabled}
          >
            <span className="truncate">{compact ? "Change" : buttonLabel}</span>
            {disabled ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuRadioGroup value={value?.kind === "cohort" ? value.scope : value ? "instance" : allowNone ? "none" : ""}>
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
            <DropdownMenuRadioItem value="server" onSelect={() => selectCohort("server")}>
              Server cohort
              <DropdownMenuShortcut>60 days</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="guild"
              disabled={!guildAvailable}
              onSelect={() => selectCohort("guild")}
            >
              Guild cohort
              <DropdownMenuShortcut>60 days</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

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
