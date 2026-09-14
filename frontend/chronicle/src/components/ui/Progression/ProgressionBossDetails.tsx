import { forwardRef } from "react";
import type { ComponentProps } from "react";
import { Check, Circle } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  HintTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import {
  progressionBossStatus,
  progressionVariantLabel,
  type ProgressionVariant,
} from "./progression";

interface ProgressionBossDetailsProps {
  instanceName: string;
  variantLabel?: string;
  canonicalBosses: Iterable<string>;
  killedBosses: Iterable<string>;
}

const DetailsButton = forwardRef<HTMLButtonElement, ComponentProps<"button">>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/50 text-[10px] font-bold leading-none text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${className ?? ""}`}
      aria-label="Show boss progression details"
      {...props}
    >
      ?
    </button>
  ),
);
DetailsButton.displayName = "DetailsButton";

function BossList({
  killed,
  missing,
}: {
  killed: readonly string[];
  missing: readonly string[];
}) {
  return (
    <div className="styled-scrollbar max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-sm">
      <section>
        <p className="mb-1.5 font-semibold text-green-400">Killed ({killed.length})</p>
        {killed.length === 0 ? (
          <p className="text-muted-foreground">No canonical bosses killed yet.</p>
        ) : (
          <ul className="space-y-1">
            {killed.map((boss) => (
              <li key={boss} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-green-400" />
                <span>{boss}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <p className="mb-1.5 font-semibold text-muted-foreground">Missing ({missing.length})</p>
        {missing.length === 0 ? (
          <p className="text-amber-500">Progression complete.</p>
        ) : (
          <ul className="space-y-1 text-muted-foreground">
            {missing.map((boss) => (
              <li key={boss} className="flex items-start gap-2">
                <Circle className="mt-1 size-2.5 shrink-0" />
                <span>{boss}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ProgressionPips({
  variant,
  total,
  className,
}: {
  variant: Pick<ProgressionVariant, "encountersDown" | "heroic">;
  total: number;
  className?: string;
}) {
  const complete = variant.encountersDown === total;
  const killColor = variant.heroic
    ? "var(--color-purple-500)"
    : complete
      ? "var(--color-amber-500)"
      : "var(--color-green-400)";

  return (
    <div className={cn("flex min-w-0 flex-1 gap-1", className)}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className="h-2 flex-1 rounded-xs"
          style={{ background: index < variant.encountersDown ? killColor : "var(--border)" }}
        />
      ))}
    </div>
  );
}

export function ProgressionBossIndicator({
  instanceName,
  variant,
  canonicalBosses,
  labelFormat = "short",
}: {
  instanceName: string;
  variant: ProgressionVariant;
  canonicalBosses?: Set<string>;
  labelFormat?: "short" | "long";
}) {
  if (canonicalBosses == null) return null;

  return (
    <ProgressionBossDetails
      instanceName={instanceName}
      variantLabel={progressionVariantLabel(variant, labelFormat)}
      canonicalBosses={canonicalBosses}
      killedBosses={variant.killedBosses}
    />
  );
}

export function ProgressionBossDetails({
  instanceName,
  variantLabel,
  canonicalBosses,
  killedBosses,
}: ProgressionBossDetailsProps) {
  const isMobile = useIsMobile();
  const status = progressionBossStatus(canonicalBosses, killedBosses);
  const title = variantLabel ? `${instanceName}, ${variantLabel}` : instanceName;

  if (isMobile) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <DetailsButton />
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-sm p-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Canonical progression bosses</DialogDescription>
          </DialogHeader>
          <BossList {...status} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <HintTooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <DetailsButton />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="w-72 max-w-[calc(100vw-2rem)] border border-border bg-card p-3 text-left text-card-foreground shadow-xl"
        hideArrow
      >
        <p className="mb-0.5 font-semibold">{title}</p>
        <p className="mb-3 text-muted-foreground">Canonical progression bosses</p>
        <BossList {...status} />
      </TooltipContent>
    </HintTooltip>
  );
}
