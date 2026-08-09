import { cn } from "@/lib/utils";

interface BreakoutIdentityProps {
  color: string;
  name: string;
  className: string;
  specialization?: string;
  compact?: boolean;
}

export function BreakoutIdentity({
  color,
  name,
  className,
  specialization,
  compact = true,
}: BreakoutIdentityProps) {
  return (
    <div className="flex min-w-0 items-center gap-2" data-breakout-identity>
      <span
        className={cn(
          "shrink-0 rounded-full shadow-[0_0_8px_currentColor]",
          compact ? "h-2 w-2" : "h-2.5 w-2.5",
        )}
        style={{ color, backgroundColor: color }}
        data-breakout-identity-dot
      />
      <span
        className={cn("truncate font-semibold", compact ? "text-xs" : "text-sm")}
        style={{ color }}
        data-breakout-identity-name
      >
        {name}
      </span>
      <span
        className={cn(
          "shrink-0 uppercase text-muted-foreground",
          compact ? "text-2xs tracking-widest" : "text-xs tracking-wide",
        )}
        data-breakout-identity-class
      >
        {specialization ? `${specialization} ${className}` : className}
      </span>
    </div>
  );
}
