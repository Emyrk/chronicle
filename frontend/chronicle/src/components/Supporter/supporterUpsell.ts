import { useSiteConfig } from "@/api/queries"
import { useAuth } from "@/hooks/useAuth"

export const SUPPORTER_PATH = "/supporter"
export const SUPPORTER_GOLD = "#f0c060"

/** Perk anchors on /supporter; locked hints deep-link to the matching showcase slide. */
export type SupporterPerk = "cosmetics" | "ad-free" | "storage" | "downloads" | "unlisted" | "future"

export function supporterPerkPath(perk: SupporterPerk): string {
  return `${SUPPORTER_PATH}#${perk}`
}

/** True when the viewer should be invited to become a supporter: billing is on and they aren't one yet. */
export function useShowSupporterUpsell(): boolean {
  const { data: siteConfig } = useSiteConfig()
  const { session, isLoading } = useAuth()
  return !!siteConfig?.billing_enabled && !isLoading && !session?.ads_free
}
