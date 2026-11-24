import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSupportedInstances } from "@/api/queries"
import { suggestionQuery } from "./suggestionQuery"
import { allNavLinks } from "../navItems"
import { matchPages, matchRankings, pickTopResult, raidSearchHref } from "./globalSearch"
import { validSuggestionQuery } from "./suggestionScheduler"

export function useGlobalSearch(query: string, open = true) {
  const q = query.trim()
  const enabled = open && validSuggestionQuery(q)
  const suggestions = useQuery(suggestionQuery(q, open))
  const { data: instances } = useSupportedInstances()
  const base = {
    rankings: matchRankings(q, instances ?? []),
    players: enabled ? (suggestions.data?.players ?? []) : [],
    guilds: enabled ? (suggestions.data?.guilds ?? []) : [],
    pages: matchPages(q, allNavLinks()),
  }
  return {
    ...base,
    top: pickTopResult(q, base),
    raidHref: raidSearchHref(q, instances ?? []),
    loading: enabled && suggestions.isFetching,
    status: !open ? "" : Array.from(q).length > 64 ? "Use at most 64 characters."
      : q && Array.from(q).length < 2 ? "Type at least 2 characters for character and guild suggestions."
      : enabled && suggestions.isFetching ? "Waiting for character and guild suggestions…"
      : enabled && suggestions.error ? suggestions.error.message : "",
  }
}

/** Opens search on ⌘K / Ctrl+K, and on "/" when no field has focus. */
export function useSearchHotkey(open: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
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
  }, [open, enabled])
}
