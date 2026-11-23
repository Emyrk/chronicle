import { useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { highlight } from "./codeHighlight"
import { luaHighlightStyle } from "./luaHighlight"

/** CSS for luaHighlightStyle's classes. An EditorView normally mounts it; render this once above static blocks. */
export function CodeHighlightStyles() {
  return <style>{luaHighlightStyle.module?.getRules() ?? ""}</style>
}

/** Read-only fenced code block for the API reference: highlighted, labelled and copyable. */
export function ApiCodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)
  const nodes = useMemo(() => highlight(code, language), [code, language])
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return <div className="not-prose group my-5 overflow-hidden rounded-lg border border-border bg-black/25">
    <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{language || "text"}</span>
      <button type="button" onClick={copy} aria-label="Copy code"
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
        {copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
      </button>
    </div>
    <pre className="styled-scrollbar overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground"><code>{nodes}</code></pre>
  </div>
}
