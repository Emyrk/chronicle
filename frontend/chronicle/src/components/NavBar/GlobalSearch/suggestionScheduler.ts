/** One pending query, a 200ms quiet period, and at most one request start per second.
 * Kept across palette mounts so closing/reopening cannot bypass the browser budget.
 */
export function createSuggestionScheduler() {
  let nextStart = 0
  let cancelPending: (() => void) | undefined
  return (signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    cancelPending?.()
    if (signal.aborted) { reject(new DOMException("Superseded search", "AbortError")); return }
    const cancel = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", cancel)
      if (cancelPending === cancel) cancelPending = undefined
      reject(new DOMException("Superseded search", "AbortError"))
    }
    cancelPending = cancel
    signal.addEventListener("abort", cancel, { once: true })
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel)
      cancelPending = undefined
      nextStart = Date.now() + 1000
      resolve()
    }, Math.max(200, nextStart - Date.now()))
  })
}

export const scheduleSuggestion = createSuggestionScheduler()

export function validSuggestionQuery(query: string): boolean {
  const length = Array.from(query.trim()).length
  return length >= 2 && length <= 64
}
