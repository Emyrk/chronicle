/** The instance and encounters a module was last previewed against, remembered per module in this browser. */
export interface PreviewSelection { instanceId: string; encounterIds: string[] }

const key = (projectId: string) => `lua-workshop-preview:${projectId}`
const MAX_ENCOUNTERS = 200

export function readPreviewSelection(projectId: string): PreviewSelection | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(projectId)) ?? "null") as Partial<PreviewSelection> | null
    if (!value || typeof value.instanceId !== "string" || !value.instanceId) return null
    const encounterIds = Array.isArray(value.encounterIds) ? value.encounterIds.filter((id): id is string => typeof id === "string").slice(0, MAX_ENCOUNTERS) : []
    return { instanceId: value.instanceId, encounterIds }
  } catch { return null }
}

export function writePreviewSelection(projectId: string, selection: PreviewSelection): void {
  try { localStorage.setItem(key(projectId), JSON.stringify(selection)) } catch { /* per-viewer preference only */ }
}

/** Saved encounters that still exist in the loaded instance, in the instance's order. */
export function restoredEncounters(saved: readonly string[], available: readonly { id: string }[]): string[] {
  const wanted = new Set(saved)
  return available.filter(encounter => wanted.has(encounter.id)).map(encounter => encounter.id)
}
