export function mobileAdOccupiedHeight(shell: HTMLElement): number {
  const shellRect = shell.getBoundingClientRect()
  let occupiedHeight = Math.max(shellRect.height, shell.scrollHeight)

  for (const element of shell.querySelectorAll<HTMLElement>("*")) {
    occupiedHeight = Math.max(occupiedHeight, element.getBoundingClientRect().bottom - shellRect.top)
  }

  return Math.max(0, Math.ceil(occupiedHeight))
}
