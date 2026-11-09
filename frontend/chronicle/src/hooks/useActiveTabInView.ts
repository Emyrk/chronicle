import { useEffect, useRef } from "react"

/**
 * Keeps the active tab of a horizontally scrolling tab bar in view. Attach the returned ref to the
 * scroll container; the active tab is the child marked `aria-current="page"` or `aria-pressed="true"`.
 * Only the container scrolls, so the page never jumps vertically.
 */
export function useActiveTabInView<T extends HTMLElement>(active: unknown) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const bar = ref.current
    const tab = bar?.querySelector<HTMLElement>('[aria-current="page"], [aria-pressed="true"]')
    if (!bar || !tab) return
    const barRect = bar.getBoundingClientRect()
    const tabRect = tab.getBoundingClientRect()
    if (tabRect.left >= barRect.left && tabRect.right <= barRect.right) return
    bar.scrollLeft += tabRect.left - barRect.left - (barRect.width - tabRect.width) / 2
  }, [active])
  return ref
}
