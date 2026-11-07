// index.html's first inline script removes ?ai_key= from the address bar
// before analytics loads and leaves the key in window.__chronicleAIKey. The
// app reads it once, only to tell the viewer what happened. The key is never
// sent to Chronicle or used as a login.

declare global {
  interface Window {
    __chronicleAIKey?: string;
  }
}

export function consumeURLAIKey(w: { __chronicleAIKey?: string } | undefined = typeof window === "undefined" ? undefined : window): string | null {
  if (!w || typeof w.__chronicleAIKey !== "string") return null;
  const key = w.__chronicleAIKey;
  delete w.__chronicleAIKey;
  return key;
}
