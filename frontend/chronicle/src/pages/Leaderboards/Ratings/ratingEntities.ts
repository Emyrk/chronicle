import { entityAttributes } from "@/components/EntityMenu/entity"
import type { RatingEntry } from "./ratingBoards.fixtures"

/** Alt+click identity for a published rating row; fixture rows intentionally have none. */
export function ratingEntryAttributes(entry: RatingEntry) {
  return entry.realm && entry.guid
    ? entityAttributes({ kind: "character", realm: entry.realm, guid: entry.guid, name: entry.name, className: entry.cls })
    : {}
}
