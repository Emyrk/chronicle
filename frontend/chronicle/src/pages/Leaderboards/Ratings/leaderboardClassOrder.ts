import { serverCapabilities } from "@/config/serverCapabilities"
import { CLASS_ORDER } from "./ratingBoards.fixtures"

export function leaderboardClassOrder(flavors: readonly string[]): readonly string[] {
  return flavors.includes("wrath") ? [...CLASS_ORDER, "DEATH_KNIGHT"] : CLASS_ORDER
}

export const CLASS_FILTER_ORDER = leaderboardClassOrder(serverCapabilities.defaultFlavor)
