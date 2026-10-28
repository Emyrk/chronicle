import { useEffect, useRef } from "react"
import { EditorState } from "@codemirror/state"
import { EditorView, lineNumbers } from "@codemirror/view"
import { StreamLanguage, syntaxHighlighting } from "@codemirror/language"
import { lua } from "@codemirror/legacy-modes/mode/lua"
import { MergeView } from "@codemirror/merge"
import { luaHighlightStyle } from "./luaHighlight"

/** Read-only highlighted diff, loaded only after the user expands an AI edit review. */
export function LuaDiffReview({ before, after }: { before: string; after: string }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!container.current) return
    const common = [EditorState.readOnly.of(true), EditorView.editable.of(false),
      lineNumbers(), StreamLanguage.define(lua), syntaxHighlighting(luaHighlightStyle),
      EditorView.theme({
        "&": { backgroundColor: "var(--background)", color: "var(--foreground)", fontSize: "12px" },
        ".cm-content": { fontFamily: "var(--font-mono, ui-monospace, monospace)", minHeight: "120px" },
        ".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" },
      })]
    const merge = new MergeView({ parent: container.current,
      a: { doc: before, extensions: common }, b: { doc: after, extensions: common },
      diffConfig: { scanLimit: 1_000, timeout: 50 }, collapseUnchanged: { margin: 3 } })
    return () => merge.destroy()
  }, [before, after])
  return <div ref={container} role="group" aria-label="AI edit differences, before on the left and after on the right"
    className="styled-scrollbar max-h-96 overflow-auto rounded-md border border-border [&_.cm-mergeView]:min-w-[540px] [&_.cm-editor]:min-w-0" />
}
