/** requestIdleCallback's deadline: deferred /start work starts by then even on a busy page. */
const IDLE_TIMEOUT_MS = 1500;

/** Runs callback once the browser is idle, or after 1.5 s; returns a cancel function. */
export function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(callback, IDLE_TIMEOUT_MS);
  return () => window.clearTimeout(timer);
}
