import { Children, isValidElement, useEffect, useState, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { Link } from "react-router-dom"
import { ChevronRight, Download, Info, Link as LinkIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import reference from "./lua-panel-api.md?raw"
import luaDefinitions from "./lua-panel-api.d.lua?raw"
import { ApiCodeBlock, CodeHighlightStyles } from "./ApiCodeBlock"
import { ModuleIcon } from "./ModuleIcon"
import { MODULE_ICON_NAMES } from "./moduleIcons"

function text(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === "string" ? child
    : isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : "").join("")
}
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const slug = (children: ReactNode) => slugify(text(children))

// The repo copy keeps its generated-section markers; the page should not print them.
const markdown = reference.replace(/<!--[\s\S]*?-->\n?/g, "")

type TocEntry = { id: string; title: string; depth: 2 | 3 }
/** h2/h3 headings in document order, skipping fenced code. */
const toc: TocEntry[] = (() => {
  const entries: TocEntry[] = []
  let fenced = false
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced
    const match = !fenced && line.match(/^(##|###) (.+)$/)
    if (!match) continue
    const title = match[2].replace(/`/g, "")
    // "ChronicleFrame extends ChronicleRegion" reads as just the class in a narrow sidebar.
    entries.push({ id: slugify(title), title: title.replace(/ extends .*/, ""), depth: match[1].length as 2 | 3 })
  }
  return entries
})()

function Anchor({ id }: { id: string }) {
  return <a href={`#${id}`} aria-label="Link to this section"
    className="ml-2 inline-flex align-middle text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary focus:opacity-100">
    <LinkIcon className="size-4" />
  </a>
}

// `ChronicleFrame extends ChronicleRegion` class headings from the generated reference.
const CLASS_HEADING = /^(Chronicle\w+)(?: extends (\w+))?$/
// `Owner:Name(name: type, ...)` signatures from the generated reference.
const SIGNATURE = /^(?:(\w+)([:.]))?(\w+)\((.*)\)$/

const iconNames = new Set<string>(MODULE_ICON_NAMES)
const isIconList = (value: string) => {
  const names = value.split(",").map(name => name.trim())
  return names.length > 10 && names.every(name => iconNames.has(name))
}

const components: Components = {
  h1: ({ children }) => <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">{children}</h1>,
  h2: ({ children }) => {
    const id = slug(children)
    return <h2 id={id} className="group mt-12 scroll-mt-6 border-t border-border pt-8">{children}<Anchor id={id} /></h2>
  },
  h3: ({ children }) => {
    const id = slug(children)
    const type = text(children).match(CLASS_HEADING)
    if (!type) return <h3 id={id} className="group scroll-mt-6">{children}<Anchor id={id} /></h3>
    return <h3 id={id} className="group mt-12 flex scroll-mt-6 flex-wrap items-baseline gap-x-2 font-mono text-lg">
      <span className="rounded bg-primary/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-primary">class</span>
      {type[1]}
      {type[2] && <span className="font-sans text-sm font-normal text-muted-foreground">extends <a className="font-mono" href={`#${slugify(type[2])}`}>{type[2]}</a></span>}
      <Anchor id={id} />
    </h3>
  },
  h4: ({ children }) => {
    const signature = text(children).match(SIGNATURE)
    if (!signature) return <h4 id={slug(children)} className="scroll-mt-6">{children}</h4>
    const [, owner, separator, name, args] = signature
    const id = slugify(`${owner ?? ""}-${name}`)
    return <h4 id={id} className="group mt-8 scroll-mt-6 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[13px] font-normal leading-relaxed">
      {owner && <span className="text-muted-foreground">{owner}{separator}</span>}
      <span className="font-semibold text-primary">{name}</span>
      <span className="text-muted-foreground">(</span>
      {args && args.split(", ").map((arg, index) => {
        const [param, type] = arg.split(/: (.*)/)
        return <span key={param}>
          {index > 0 && <span className="text-muted-foreground">, </span>}
          <span className="text-foreground">{param}</span>
          {type && <span className="text-muted-foreground">: <span className="text-[#c792ea]">{type}</span></span>}
        </span>
      })}
      <span className="text-muted-foreground">)</span>
      <Anchor id={id} />
    </h4>
  },
  pre: ({ children }) => {
    const code = Children.toArray(children)[0]
    if (!isValidElement<{ className?: string; children?: ReactNode }>(code)) return <pre>{children}</pre>
    const language = code.props.className?.match(/language-(\w+)/)?.[1] ?? ""
    return <ApiCodeBlock code={text(code.props.children).replace(/\n$/, "")} language={language} />
  },
  table: ({ children }) => <div className="styled-scrollbar not-prose my-5 overflow-x-auto rounded-lg border border-border">
    <table className="w-full border-collapse text-left text-[13px] [&_td:first-child_code]:whitespace-nowrap">{children}</table>
  </div>,
  thead: ({ children }) => <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
  tr: ({ children }) => <tr className="border-t border-border first:border-t-0 even:bg-muted/10">{children}</tr>,
  td: ({ children }) => <td className="px-3 py-2 align-top leading-relaxed">{children}</td>,
  blockquote: ({ children }) => <div className="not-prose my-5 flex gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-relaxed [&_strong]:font-semibold">
    <Info className="mt-0.5 size-4 shrink-0 text-primary" />
    <div>{children}</div>
  </div>,
  p: ({ children }) => {
    // FAQ entries are a bold question, a line break, then the answer.
    const [first, second, ...rest] = Children.toArray(children)
    if (isValidElement(first) && first.type === "strong" && typeof second === "string" && second.startsWith("\n")) {
      return <div className="not-prose my-3 rounded-lg border border-border bg-muted/15 px-4 py-3 text-sm leading-relaxed">
        <p className="mb-1 font-semibold text-foreground">{text(first)}</p>
        <p className="text-muted-foreground [&_a]:text-primary [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-foreground">{second.slice(1)}{rest}</p>
      </div>
    }
    const value = text(children)
    if (!isIconList(value)) return <p>{children}</p>
    return <ul className="not-prose my-5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
      {value.split(",").map(name => name.trim()).map(name => <li key={name}
        className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5 font-mono text-xs">
        <ModuleIcon name={name} className="size-4 shrink-0 text-primary" />{name}
      </li>)}
    </ul>
  },
}

/** The TOC entry for the heading nearest above the top of the viewport. */
function useActiveSection() {
  const [active, setActive] = useState(toc[0]?.id ?? "")
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      let current = toc[0]?.id ?? ""
      for (const entry of toc) {
        const element = document.getElementById(entry.id)
        if (!element || element.getBoundingClientRect().top > 120) break
        current = entry.id
      }
      setActive(current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  return active
}

function TableOfContents({ active }: { active: string }) {
  return <nav aria-label="On this page" className="text-sm">
    <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">On this page</p>
    <ul className="space-y-0.5 border-l border-border">
      {toc.map(entry => <li key={entry.id}>
        <a href={`#${entry.id}`} className={cn("-ml-px block border-l py-1 leading-snug transition-colors",
          entry.depth === 3 ? "pl-6 text-[13px]" : "pl-3",
          active === entry.id ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground")}>
          {entry.title}
        </a>
      </li>)}
    </ul>
  </nav>
}

/** Author-facing module API reference, rendered from lua-panel-api.md (the same file reviewers read in the repo). */
export default function LuaPanelApiPage() {
  const definitionsURL = `data:text/plain;charset=utf-8,${encodeURIComponent(luaDefinitions)}`
  const active = useActiveSection()
  // The page is lazy-loaded, so the browser's own jump to #section happens before the heading exists.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])
  return <main className="container mx-auto max-w-7xl px-4 py-8">
    <CodeHighlightStyles />
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link className="hover:text-foreground" to="/modules">Modules</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">API reference</span>
      </nav>
      <div className="flex items-center gap-2">
        <span className="hidden rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground sm:inline">Lua 5.3 · chronicle.v1</span>
        <a href={definitionsURL} download="lua-panel-api.d.lua"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">
          <Download className="size-4" /> LuaLS definitions
        </a>
      </div>
    </div>
    <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="styled-scrollbar sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pb-6 pr-2">
          <TableOfContents active={active} />
        </div>
      </aside>
      <div className="min-w-0">
        <details className="mb-6 rounded-lg border border-border px-4 py-2 lg:hidden">
          <summary className="cursor-pointer py-1 text-sm font-medium">On this page</summary>
          <div className="mt-2 pb-2"><TableOfContents active={active} /></div>
        </details>
        <article className="prose prose-sm dark:prose-invert max-w-[52rem] prose-headings:scroll-mt-6 prose-h2:text-xl prose-h3:mt-8 prose-h3:text-base prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-li:my-1 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[0.85em]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{markdown}</ReactMarkdown>
        </article>
      </div>
    </div>
  </main>
}
