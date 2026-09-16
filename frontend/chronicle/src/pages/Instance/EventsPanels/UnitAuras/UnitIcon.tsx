import { Skull } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnitSearchOption } from "./UnitSearch";

function classIconUrl(className: string | undefined): string {
  return `/c/icons/class_${(className ?? "unknown").toLowerCase()}.png`;
}

export function UnitIcon({
  unit,
  className,
}: {
  unit: UnitSearchOption;
  className?: string;
}) {
  if (unit.relation === "hostile") {
    return (
      <span className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded bg-rose-500/12 text-rose-400",
        className,
      )}>
        <Skull className="size-3.5" />
      </span>
    );
  }

  const fallback = classIconUrl(unit.className);
  return (
    <img
      src={unit.specializationIconUrl ?? fallback}
      alt=""
      className={cn(
        "size-6 shrink-0 rounded border border-border/70 bg-black/40 object-cover",
        className,
      )}
      onError={(event) => {
        const image = event.currentTarget;
        image.src = image.src.endsWith(fallback) ? "/c/icons/class_unknown.png" : fallback;
      }}
    />
  );
}
