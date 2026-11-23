import type { ReactNode } from "react"
import { StreamLanguage } from "@codemirror/language"
import { json } from "@codemirror/legacy-modes/mode/javascript"
import { lua } from "@codemirror/legacy-modes/mode/lua"
import { highlightCode } from "@lezer/highlight"
import { luaHighlightStyle } from "./luaHighlight"

const parsers: Record<string, StreamLanguage<unknown>["parser"]> = {
  lua: StreamLanguage.define(lua).parser,
  json: StreamLanguage.define(json).parser,
}

export function highlight(code: string, language: string): ReactNode[] {
  const parser = parsers[language]
  if (!parser) return [code]
  const nodes: ReactNode[] = []
  highlightCode(code, parser.parse(code), luaHighlightStyle,
    (text, classes) => nodes.push(classes ? <span key={nodes.length} className={classes}>{text}</span> : text),
    () => nodes.push("\n"))
  return nodes
}

/** Like highlight, but one node list per line so callers can number them. */
export function highlightLines(code: string, language: string): ReactNode[][] {
  const parser = parsers[language]
  if (!parser) return code.split("\n").map(line => [line])
  const lines: ReactNode[][] = [[]]
  highlightCode(code, parser.parse(code), luaHighlightStyle,
    (text, classes) => { const line = lines[lines.length - 1]; line.push(classes ? <span key={line.length} className={classes}>{text}</span> : text) },
    () => lines.push([]))
  return lines
}
