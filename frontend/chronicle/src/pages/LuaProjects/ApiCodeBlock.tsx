import { useMemo, useState, type ReactNode } from "react"
import { StreamLanguage } from "@codemirror/language"
import { json } from "@codemirror/legacy-modes/mode/javascript"
import { lua } from "@codemirror/legacy-modes/mode/lua"
import { highlightCode } from "@lezer/highlight"
import { Check, Copy } from "lucide-react"
import { luaHighlightStyle } from "./luaHighlight"

const parsers: Record<string, StreamLanguage<unknown>["parser"]> = {
  lua: StreamLanguage.define(lua).parser,
  json: StreamLanguage.define(json).parser,
}

/** CSS for luaHighlightStyle's classes. An EditorView normally mounts it; render this once above static blocks. */
export function CodeHighlightStyles() {
  return <style>{luaHighlightStyle.module?.getRules() ?? ""}</style>
}

function highlight(code: string, language: string): ReactNode[] {
  const parser = parsers[language]
  if (!parser) return [code]
  const nodes: ReactNode[] = []
  highlightCode(code, parser.parse(code), luaHighlightStyle,
    (text, classes) => nodes.push(classes ? <span key={nodes.length} className={classes}>{text}</span> : text),
    () => nodes.push("\n"))
  return nodes
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
