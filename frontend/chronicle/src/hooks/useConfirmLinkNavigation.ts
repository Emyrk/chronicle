import { useEffect, useEffectEvent } from "react"

interface LinkClick {
  button: number
  modified: boolean
  defaultPrevented: boolean
  target: string | null
  download: boolean
  href: string
}

/** True when a click would navigate this tab to another page of the app, which unmounts the current one. */
export function leavesPage(click: LinkClick, current: { origin: string; pathname: string }): boolean {
  if (click.button !== 0 || click.modified || click.defaultPrevented || click.download) return false
  if (click.target && click.target !== "_self") return false
  let url: URL
  try { url = new URL(click.href, current.origin) } catch { return false }
  return url.origin === current.origin && url.pathname !== current.pathname
}

/**
 * Asks before in-app link clicks (nav bar, breadcrumbs, any <Link>) leave the page while `when` is true.
 * BrowserRouter has no useBlocker, so this cancels the click in the capture phase, before React Router's
 * Link handler sees it. Reloads and closing the tab need a separate beforeunload handler.
 */
export function useConfirmLinkNavigation(when: boolean, message: string) {
  const onClick = useEffectEvent((event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null
    if (!(anchor instanceof HTMLAnchorElement)) return
    const click = { button: event.button, modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
      defaultPrevented: event.defaultPrevented, target: anchor.getAttribute("target"), download: anchor.hasAttribute("download"), href: anchor.href }
    if (!leavesPage(click, window.location) || window.confirm(message)) return
    event.preventDefault()
    event.stopPropagation()
  })
  useEffect(() => {
    if (!when) return
    const listener = (event: MouseEvent) => onClick(event)
    document.addEventListener("click", listener, true)
    return () => document.removeEventListener("click", listener, true)
  }, [when])
}
