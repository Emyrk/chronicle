import { Megaphone } from "lucide-react"
import { isLocalAdPreviewHost } from "./adPreview"

export function LeaderboardAdSlot({
  hostname = window.location.hostname,
}: {
  hostname?: string
}) {
  if (!isLocalAdPreviewHost(hostname)) {
    return null
  }

  return (
    <aside className="my-5" aria-label="Advertisement preview">
      <div className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
        Advertisement
      </div>
      <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 px-5 py-4">
        <div className="flex max-w-xl items-center gap-3 text-muted-foreground">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background/70">
            <Megaphone className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground/80">Leaderboard ad preview</p>
            <p className="mt-0.5 text-xs leading-relaxed">
              A responsive ad will use this reserved space without shifting the leaderboard content.
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
