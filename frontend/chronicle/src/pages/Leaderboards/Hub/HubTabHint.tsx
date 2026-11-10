import type { ReactElement } from "react"
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"

/** A hub tab with a hover hint saying what the tab is for. */
export function HubTabHint({ description, children }: { description: string; children: ReactElement }) {
  return (
    <HintTooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 text-center">{description}</TooltipContent>
    </HintTooltip>
  )
}
