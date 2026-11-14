import { Layers3 } from "lucide-react";
import { specializationIconUrl } from "@/config/specializationIcon";

interface PerformanceSpecSelectorProps {
  playerClass: string;
  specs: string[];
  selectedSpec: string | null;
  onSpecChange: (spec: string | null) => void;
  label: string;
}

export function PerformanceSpecSelector({
  playerClass,
  specs,
  selectedSpec,
  onSpecChange,
  label,
}: PerformanceSpecSelectorProps) {
  if (specs.length < 2) return null;

  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-label="Show overall performance"
        aria-pressed={selectedSpec === null}
        title="Overall"
        onClick={() => onSpecChange(null)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          selectedSpec === null
            ? "border-primary/50 bg-primary/15 text-foreground"
            : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Layers3 className="size-4" />
        <span className="hidden sm:inline">Overall</span>
      </button>
      {specs.map((spec) => (
        <button
          key={spec}
          type="button"
          aria-label={`Show ${spec} performance`}
          aria-pressed={selectedSpec === spec}
          title={spec}
          onClick={() => onSpecChange(spec)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            selectedSpec === spec
              ? "border-primary/50 bg-primary/15 text-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <img
            src={specializationIconUrl(playerClass, spec)}
            alt=""
            className="size-5 rounded-sm"
          />
          <span className="hidden sm:inline">{spec}</span>
        </button>
      ))}
    </div>
  );
}
