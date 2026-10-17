interface NavigationModifiers {
  ctrlKey: boolean
  metaKey: boolean
}

type Navigate = (to: string) => void
type OpenNewTab = (url: string) => void

export function navigateWithModifiers(
  to: string,
  modifiers: NavigationModifiers,
  navigate: Navigate,
  openNewTab: OpenNewTab = (url) => {
    window.open(url, "_blank", "noopener,noreferrer")
  },
) {
  if (modifiers.ctrlKey || modifiers.metaKey) {
    openNewTab(to)
    return
  }

  navigate(to)
}
