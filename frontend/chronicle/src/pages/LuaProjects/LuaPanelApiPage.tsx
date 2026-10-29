import { Children, isValidElement, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { Link } from "react-router-dom"
import { ArrowLeft, Download } from "lucide-react"
import reference from "./lua-panel-api.md?raw"
import luaDefinitions from "./lua-panel-api.d.lua?raw"

function text(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === "string" ? child
    : isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : "").join("")
}
const slug = (children: ReactNode) => text(children).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

// Headings get ids so in-page links such as [Events](#events) work.
const components: Components = {
  h2: ({ children }) => <h2 id={slug(children)} className="scroll-mt-20">{children}</h2>,
  h3: ({ children }) => <h3 id={slug(children)} className="scroll-mt-20">{children}</h3>,
}

/** Author-facing module API reference, rendered from lua-panel-api.md (the same file reviewers read in the repo). */
export default function LuaPanelApiPage() {
  const definitionsURL = `data:text/plain;charset=utf-8,${encodeURIComponent(luaDefinitions)}`
  return <main className="container mx-auto max-w-4xl px-4 py-10">
    <div className="mb-6 flex items-center justify-between gap-4">
      <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to="/modules"><ArrowLeft className="size-4" /> Modules</Link>
      <a href={definitionsURL} download="lua-panel-api.d.lua" className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"><Download className="size-4" /> LuaLS definitions</a>
    </div>
    <article className="prose prose-sm dark:prose-invert max-w-none prose-a:text-primary prose-pre:bg-muted/60 prose-pre:text-foreground prose-table:text-xs prose-th:px-2 prose-td:px-2 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{reference}</ReactMarkdown>
    </article>
  </main>
}
