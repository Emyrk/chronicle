import { createContext, useContext } from "react"

export const AdSuppressionContext = createContext(false)

export function useAdsSuppressed() {
  return useContext(AdSuppressionContext)
}
