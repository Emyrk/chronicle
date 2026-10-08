import { ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

export function ToolsBackLink({ className }: { className?: string }) {
  return (
    <Link
      to="/tools"
      className={cn(
        "inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to Tools &amp; FAQ
    </Link>
  )
}
