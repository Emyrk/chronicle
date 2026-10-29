import { createElement } from "react"
import { moduleIconComponent } from "./moduleIcons"

/** A module's icon, or the generic module icon when it names none or one this build does not know. */
export function ModuleIcon({ name, className = "size-4" }: { name?: string | null; className?: string }) {
  // The icon is one of a fixed set of module-level components, picked by name.
  return createElement(moduleIconComponent(name), { className, "aria-hidden": true })
}
