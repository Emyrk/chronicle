import { useState } from "react"
import { AlertTriangle, BookOpen, Check, Copy } from "lucide-react"
import { moduleErrorReport, type ModuleErrorExplanation } from "../../../Guides/runtime/moduleErrors"

/** Explains why an module stopped and what to change, instead of only the raw Lua error. */
export function ModuleErrorCard({ error }: { error: ModuleErrorExplanation }) {
  const [copied, setCopied] = useState(false)
  const copy = () => void navigator.clipboard?.writeText(moduleErrorReport(error)).then(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2_000)
  }, () => {})
  return <div role="alert" className="m-3 space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
    <p className="flex items-start gap-2 font-semibold text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>Module stopped: {error.title}</span>
    </p>
    {error.where && <p className="font-mono text-xs text-muted-foreground">{error.where}</p>}
    <p>{error.detail}</p>
    {error.fixes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs">{error.fixes.map(fix => <li key={fix}>{fix}</li>)}</ul>}
    <p className="break-words font-mono text-[11px] text-muted-foreground">{error.raw}</p>
    <div className="flex flex-wrap gap-2 pt-1">
      <button type="button" onClick={copy} title="Copy the error and its explanation, to paste into an AI assistant"
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy error"}
      </button>
      {error.docs && <a href={`/modules/api#${error.docs}`} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent">
        <BookOpen className="size-3.5" /> Module API reference
      </a>}
    </div>
  </div>
}
