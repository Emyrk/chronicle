import { useState } from "react"
import { MOCK_REALMS } from "@/pages/Leaderboards/Ratings/mockRealm"

/** Remembers the leaderboard realm per browser. */
export const REALM_KEY = "chronicle.leaderboards.realm"

/** Realms the picker offers. Mock list; production reads the ranked realms from the API. */
export const HUB_REALMS: readonly string[] = MOCK_REALMS

function readStoredRealm(realms: readonly string[]): string {
  try {
    const stored = localStorage.getItem(REALM_KEY)
    if (stored && realms.includes(stored)) return stored
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
  }
  return realms[0]
}

/**
 * The page's realm: the last one picked in this browser, else the first (busiest) realm. Every
 * change is saved for the next visit.
 */
export function useHubRealm(realms: readonly string[] = HUB_REALMS, initial?: string): [string, (realm: string) => void] {
  const [realm, setRealmState] = useState(() => (initial && realms.includes(initial) ? initial : readStoredRealm(realms)))
  const setRealm = (next: string) => {
    setRealmState(next)
    try {
      localStorage.setItem(REALM_KEY, next)
    } catch {
      // The choice still applies for this visit.
    }
  }
  return [realm, setRealm]
}
