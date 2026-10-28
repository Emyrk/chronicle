import { createElement } from "react"
import { addonIconComponent } from "./addonIcons"

/** An addon's icon, or the generic addon icon when it names none or one this build does not know. */
export function AddonIcon({ name, className = "size-4" }: { name?: string | null; className?: string }) {
  // The icon is one of a fixed set of module-level components, picked by name.
  return createElement(addonIconComponent(name), { className, "aria-hidden": true })
}
