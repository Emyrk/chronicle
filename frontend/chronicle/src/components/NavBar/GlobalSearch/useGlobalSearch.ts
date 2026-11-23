import { useEffect, useMemo } from "react"
import { useArmorySearch, useGuildSearch, useSupportedInstances } from "@/api/queries"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { allNavLinks } from "../navItems"
import { matchPages, matchRankings, pickTopResult, type GlobalSearchResults } from "./globalSearch"

export function useGlobalSearch(query: string): GlobalSearchResults & { loading: boolean } {
  const debounced = useDebouncedValue(query.trim(), 200)
  const enabled = debounced.length >= 2
  const players = useArmorySearch({ q: debounced }, { enabled })
  const guilds = useGuildSearch({ search: debounced }, { enabled })
  const { data: instances } = useSupportedInstances()
  return useMemo(() => {
    const base = {
      rankings: matchRankings(debounced, instances ?? []),
      players: enabled ? (players.data?.players ?? []).slice(0, 5) : [],
      guilds: enabled ? (guilds.data?.guilds ?? []).slice(0, 4) : [],
      pages: matchPages(debounced, allNavLinks()),
    }
    return { ...base, top: pickTopResult(debounced, base), loading: enabled && (players.isFetching || guilds.isFetching) }
  }, [debounced, enabled, instances, players.data, players.isFetching, guilds.data, guilds.isFetching])
}

/** Opens search on ⌘K / Ctrl+K, and on "/" when no field has focus. */
export function useSearchHotkey(open: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault()
        open()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
}
