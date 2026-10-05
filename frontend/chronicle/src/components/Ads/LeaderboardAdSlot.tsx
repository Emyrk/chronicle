import { cn } from "@/lib/utils"
import { isLocalAdPreviewHost } from "./adPreview"

type LeaderboardAdVariant = "rail" | "compact"

const variantClasses: Record<LeaderboardAdVariant, string> = {
  rail: "hidden w-40 shrink-0 2xl:block",
  compact: "hidden w-full lg:block 2xl:hidden",
}

const frameClasses: Record<LeaderboardAdVariant, string> = {
  rail: "min-h-[600px]",
  compact: "min-h-28",
}

export function LeaderboardAdSlot({
  variant,
  hostname = window.location.hostname,
  className,
}: {
  variant: LeaderboardAdVariant
  hostname?: string
  className?: string
}) {
  if (!isLocalAdPreviewHost(hostname)) {
    return null
  }

  return (
    <aside className={cn(variantClasses[variant], className)} aria-label="Advertisement preview">
      <div className={cn("sticky top-20", variant === "compact" && "static")}>
        <div className="mb-1.5 text-center text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
          Advertisement
        </div>
        <div
          className={cn(
            "relative flex items-center justify-center overflow-hidden rounded-md border border-dashed border-border/60 bg-muted/10",
            frameClasses[variant],
          )}
        >
          <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(135deg,currentColor_12.5%,transparent_12.5%,transparent_50%,currentColor_50%,currentColor_62.5%,transparent_62.5%,transparent)] [background-size:12px_12px]" />
          <div className="relative text-center text-muted-foreground/55">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em]">Ad preview</p>
            <p className="mt-1 font-mono text-[10px]">
              {variant === "rail" ? "160 × 600" : "responsive"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
