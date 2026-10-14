import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { parseBgColor, parseBorderColor, parseColor, parseHexColor } from "@/pages/Instance/parseColors";
import type { CohortSummary, TierCutoff } from "./cohortStats";

export interface SelectOption {
  value: string;
  label: string;
}

/** Compact labeled native select used in the cohort filter row. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-[9rem] flex-col gap-1", className)}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Two or more mutually exclusive buttons, e.g. DPS/HPS. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>}
      <div role="radiogroup" aria-label={label} className="inline-flex h-9 rounded-md border border-border bg-background p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              value === option.value ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ParsePill({ score, className }: { score: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block min-w-[2.25rem] rounded border px-1.5 py-0.5 text-center font-mono text-xs font-bold tabular-nums",
        parseColor(score),
        parseBgColor(score),
        parseBorderColor(score),
        className,
      )}
    >
      {score}
    </span>
  );
}

/**
 * Stat tiles (sample, best, median, worst) plus the weakest value that still
 * reaches each parse tier.
 */
export function CohortSummaryStrip({
  summary,
  cutoffs,
  formatValue,
  bestLabel,
  worstLabel,
  sampleLabel,
  status,
}: {
  summary: CohortSummary;
  cutoffs: readonly TierCutoff[];
  formatValue: (value: number) => string;
  bestLabel: string;
  worstLabel: string;
  sampleLabel: string;
  status?: string;
}) {
  const tiles = [
    { label: sampleLabel, value: summary.count.toLocaleString() },
    { label: bestLabel, value: formatValue(summary.best) },
    { label: "Median", value: formatValue(summary.median) },
    { label: worstLabel, value: formatValue(summary.worst) },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">{tile.label}</div>
            <div className="mt-0.5 text-xl font-semibold text-foreground">{tile.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">Needed for each parse</span>
          {status === "low_confidence" && <span className="text-[11px] text-amber-400">Small sample: low confidence</span>}
          {status === "sample_too_small" && <span className="text-[11px] text-amber-400">Too few runs to score</span>}
        </div>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {cutoffs.map((cutoff) => (
            <div key={cutoff.floor} className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: parseHexColor(cutoff.floor) }} aria-hidden />
                {cutoff.floor}+
              </div>
              <div className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums text-foreground">
                {cutoff.value === null ? "—" : formatValue(cutoff.value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Centered message for empty, loading, and error states. */
export function CohortMessage({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** Clickable chips for choosing an instance or boss before a cohort loads. */
export function ChoiceChips({
  title,
  choices,
  onChoose,
}: {
  title: string;
  choices: readonly { value: string; label: string; count: number }[];
  onChoose: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 text-sm font-medium text-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            onClick={() => onChoose(choice.value)}
            className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {choice.label}
            <span className="text-xs tabular-nums text-muted-foreground">{choice.count.toLocaleString()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
