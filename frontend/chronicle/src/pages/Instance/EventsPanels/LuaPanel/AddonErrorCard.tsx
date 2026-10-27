import { AlertTriangle, BookOpen, Sparkles } from "lucide-react"
import { formatAddonError, type AddonErrorExplanation } from "../../../Guides/runtime/addonErrors"

/** Explains why an addon stopped and what to change, instead of only the raw Lua error. */
export function AddonErrorCard({ error, onAskAssistant }: { error: AddonErrorExplanation; onAskAssistant?: (prompt: string) => void }) {
  return <div role="alert" className="m-3 space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
    <p className="flex items-start gap-2 font-semibold text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>Addon stopped: {error.title}</span>
    </p>
    {error.where && <p className="font-mono text-xs text-muted-foreground">{error.where}</p>}
    <p>{error.detail}</p>
    {error.fixes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs">{error.fixes.map(fix => <li key={fix}>{fix}</li>)}</ul>}
    <p className="break-words font-mono text-[11px] text-muted-foreground">{error.raw}</p>
    {(onAskAssistant || error.docs) && <div className="flex flex-wrap gap-2 pt-1">
      {onAskAssistant && <button type="button" onClick={() => onAskAssistant(`The preview stopped with this error. Please fix main.lua, then run the preview to confirm.\n\n${formatAddonError(error)}`)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90">
        <Sparkles className="size-3.5" /> Ask the assistant to fix it
      </button>}
      {error.docs && <a href={`/addons/api#${error.docs}`} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent">
        <BookOpen className="size-3.5" /> Addon API reference
      </a>}
    </div>}
  </div>
}
