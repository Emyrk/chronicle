/**
 * The realm the mock leaderboard data is generated for. Ratings are per realm, so every fixture
 * salts its random streams with it: switching realm shows different players, guilds' numbers, and
 * leaders. Mock-only; production passes the realm to the API instead.
 */
export const MOCK_REALMS = ["Nordanaar", "Tel'Abim", "Ambershire"] as const

let current: string = MOCK_REALMS[0]

/** Set before rendering the hub so every fixture call below it uses this realm. */
export function setMockRealm(realm: string) {
  current = realm
}

export function mockRealm(): string {
  return current
}

/** A stable number per realm, to offset fixture seeds. */
export function mockRealmSeed(): number {
  let h = 2166136261
  for (let i = 0; i < current.length; i++) h = Math.imul(h ^ current.charCodeAt(i), 16777619)
  return (h >>> 0) % 100_000
}
