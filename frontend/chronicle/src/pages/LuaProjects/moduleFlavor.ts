import { useSiteConfig } from "@/api/queries"
import type { LuaProject } from "./api"

/** The flavor tags a module may need, matching the server's LuaProjectFlavorTags. */
export const MODULE_FLAVOR_TAGS: { tag: string; label: string; hint: string }[] = [
  { tag: "vanilla", label: "Vanilla", hint: "Classic 1.12 servers, such as Turtle WoW, Kronos and VanillaPlus." },
  { tag: "tbc", label: "TBC", hint: "The Burning Crusade (2.4.3) servers." },
  { tag: "wrath", label: "Wrath", hint: "Wrath of the Lich King (3.3.5a) servers, such as Warmane and Project Epoch." },
  { tag: "nightmare-of-ursol", label: "Nightmare of Ursol", hint: "The Nightmare of Ursol custom content shared by Turtle WoW and OctoWoW." },
]

/** The site's flavor tags, from the tenant's dataset. */
export function useSiteFlavor(): readonly string[] {
  return useSiteConfig().data?.dataset_flavor ?? []
}

/** Whether this site has every flavor tag the module needs. */
export function fitsSite(project: Pick<LuaProject, "flavor">, site: readonly string[]): boolean {
  return (project.flavor ?? []).every(tag => site.includes(tag))
}
