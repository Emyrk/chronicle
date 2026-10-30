import { useState } from "react"
import { Check, X } from "lucide-react"
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { updateProject, type LuaProject } from "./api"
import { errorMessage } from "./moduleUi"
import { fitsSite, MODULE_FLAVOR_TAGS, useSiteFlavor } from "./moduleFlavor"

function tagHint(hint: string, onSite: boolean, editable: boolean) {
  return <>{hint}<br /><span className="text-muted-foreground">
    {onSite ? "This site uses it." : editable ? "This site does not use it, so it can only be changed from a site that does." : "This site does not use it."}</span></>
}

/**
 * The module's flavor tags. A module is only listed on sites that have all of them. Editors toggle tags in place,
 * but only ones this site has: another site's tags stay as they are.
 */
export function ModuleFlavorTags({ project, canEdit, onSaved }: { project: LuaProject; canEdit: boolean; onSaved: () => void }) {
  const site = useSiteFlavor()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const flavor = project.flavor ?? []

  async function toggle(tag: string) {
    setBusy(true); setError("")
    try {
      await updateProject(project.id, { description: project.description, flavor: flavor.includes(tag) ? flavor.filter(t => t !== tag) : [...flavor, tag] })
      onSaved()
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  const shown = canEdit ? MODULE_FLAVOR_TAGS : MODULE_FLAVOR_TAGS.filter(({ tag }) => flavor.includes(tag))
  if (shown.length === 0) return null
  return <div className="mt-3">
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Flavor tags">
      {shown.map(({ tag, label, hint }) => {
        const selected = flavor.includes(tag)
        const onSite = site.includes(tag)
        const className = `inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${selected
          ? onSite ? "border-sky-400/60 bg-sky-400/10 text-sky-300" : "border-destructive/60 bg-destructive/10 text-destructive"
          : "border-dashed border-border text-muted-foreground"} ${canEdit && onSite ? "hover:border-sky-400/60" : ""} disabled:cursor-not-allowed disabled:opacity-60`
        const content = <>{selected && (onSite ? <Check className="size-3" /> : <X className="size-3" />)}{label}</>
        return <HintTooltip key={tag}>
          <TooltipTrigger asChild>
            {canEdit
              ? <button type="button" aria-pressed={selected} disabled={busy || !onSite} onClick={() => void toggle(tag)} className={className}>{content}</button>
              : <span className={className}>{content}</span>}
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{tagHint(hint, onSite, canEdit)}</TooltipContent>
        </HintTooltip>
      })}
    </div>
    {canEdit && <p className="mt-1.5 text-xs text-muted-foreground">Modules are only listed on sites that use every selected tag. None selected lists it everywhere.</p>}
    {!fitsSite(project, site) && <p className="mt-1.5 text-xs text-destructive">This site does not use every tag, so the module is not listed here.</p>}
    {error && <p role="alert" className="mt-1.5 text-xs text-destructive">{error}</p>}
  </div>
}
