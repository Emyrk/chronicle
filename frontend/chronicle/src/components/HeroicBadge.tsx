import { cn } from "@/lib/utils";

interface HeroicBadgeProps {
  /** "sm" for compact cards (InstanceDayCard), "md" for larger cards (RaidCard, InstancePage) */
  size?: "sm" | "md";
  /** The run mixes heroic and normal bosses; renders "Mixed" ("M" when sm). */
  mixed?: boolean;
  className?: string;
}

/**
 * Purple "Heroic" badge with shimmer animation.
 * Use size="sm" for inline/compact contexts (renders "H"),
 * size="md" for cards and headers (renders "Heroic").
 */
export function HeroicBadge({ size = "md", mixed = false, className }: HeroicBadgeProps) {
  return (
    <span
      title={mixed ? "Mixed difficulty: heroic and normal bosses" : undefined}
      className={cn(
        "relative inline-flex overflow-hidden font-bold text-white bg-purple-600/90 rounded border border-purple-400/30",
        "shadow-[0_0_10px_rgba(147,51,234,0.6),0_0_3px_rgba(192,132,252,0.4)]",
        size === "sm"
          ? "text-[10px] px-1.5 py-0.5"
          : "text-xs px-2 py-0.5 drop-shadow-[0_0_6px_rgba(192,132,252,0.8)]",
        className,
      )}
    >
      {mixed ? (size === "sm" ? "M" : "Mixed") : size === "sm" ? "H" : "Heroic"}
      <span className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </span>
  );
}
