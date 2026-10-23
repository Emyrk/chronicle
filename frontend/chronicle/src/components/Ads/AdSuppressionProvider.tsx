import type { ReactNode } from "react"
import { AdSuppressionContext } from "./adSuppression"

export function AdSuppressionProvider({
  suppressed,
  children,
}: {
  suppressed: boolean
  children: ReactNode
}) {
  return <AdSuppressionContext.Provider value={suppressed}>{children}</AdSuppressionContext.Provider>
}
