import { Children, isValidElement, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import reference from "./lua-panel-api.md?raw"

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

/** Author-facing Lua panel API reference, rendered from lua-panel-api.md (the same file reviewers read in the repo). */
export default function LuaPanelApiPage() {
  return <main className="container mx-auto max-w-4xl px-4 py-10">
    <Link className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to="/lua-projects"><ArrowLeft className="size-4" /> Lua projects</Link>
    <article className="prose prose-sm dark:prose-invert max-w-none prose-a:text-primary prose-pre:bg-muted/60 prose-pre:text-foreground prose-table:text-xs prose-th:px-2 prose-td:px-2 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{reference}</ReactMarkdown>
    </article>
  </main>
}
