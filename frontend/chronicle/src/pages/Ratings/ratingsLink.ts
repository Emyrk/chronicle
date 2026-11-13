/** A /ratings deep link: one Armory character, optionally one raid, spec, and metric. */
export interface RatingsLink {
  /** Realm name, as in Armory URLs. */
  realm: string
  player: string
  /** Raid variant key: instance|difficulty|max players. */
  raid?: string
  /** Cohort key: class|spec|sub spec. */
  spec?: string
  metric?: string
  /** Encounter name; the whole raid when absent. */
  boss?: string
}

export function ratingsExplainerHref(link: RatingsLink): string {
  const params = new URLSearchParams({ realm: link.realm, player: link.player })
  if (link.raid) params.set("raid", link.raid)
  if (link.spec !== undefined) params.set("spec", link.spec)
  if (link.metric) params.set("metric", link.metric)
  if (link.boss) params.set("boss", link.boss)
  return `/ratings?${params}`
}

export function parseRatingsLink(params: URLSearchParams): RatingsLink | undefined {
  const realm = params.get("realm")
  const player = params.get("player")
  if (!realm || !player) return undefined
  return {
    realm,
    player,
    raid: params.get("raid") ?? undefined,
    spec: params.get("spec") ?? undefined,
    metric: params.get("metric") ?? undefined,
    boss: params.get("boss") ?? undefined,
  }
}
