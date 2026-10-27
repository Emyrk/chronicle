import { HighlightStyle } from "@codemirror/language"
import { tags } from "@lezer/highlight"

/** Dark-surface palette; the default CodeMirror style is tuned for light backgrounds. */
export const luaHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#c792ea" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "#7f8c98", fontStyle: "italic" },
  { tag: [tags.string, tags.special(tags.string)], color: "#c3e88d" },
  { tag: [tags.number, tags.bool, tags.atom, tags.null], color: "#f78c6c" },
  { tag: [tags.function(tags.variableName), tags.standard(tags.variableName)], color: "#82aaff" },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: "#89ddff" },
  { tag: [tags.variableName, tags.propertyName], color: "var(--foreground)" },
])
