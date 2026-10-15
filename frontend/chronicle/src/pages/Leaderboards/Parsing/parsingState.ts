/**
 * URL + localStorage state for the leaderboards Parsing tab.
 *
 * The URL is the source of truth so views can be shared. A visit whose URL
 * carries no parsing params (e.g. clicking the tab) restores the viewer's
 * last selection from localStorage; a shared link always wins.
 */

export type ParsingView = "spreads" | "spec"
export type ParsingMetric = "dps" | "hps"

export const PARSING_PREFS_KEY = "chronicle.leaderboards.parsing"

/**
 * Params that mark a URL as an explicit parsing selection. `instance`, `diff`
 * and `size` are excluded: the instance picker sets them on a fresh visit.
 */
export const PARSING_SELECTION_PARAMS = ["view", "metric", "boss", "hide", "class", "spec", "sub_spec"] as const

export interface ParsingPrefs {
  view: ParsingView
  metric: ParsingMetric
  /** Hidden spread rows per metric; see hiddenKey. */
  hidden: Record<ParsingMetric, string[]>
  playerClass: string
  playerSpec: string
  playerSubSpec: string
  /** Last boss viewed, per instance. */
  bossByInstance: Record<string, string>
}

export const DEFAULT_PARSING_PREFS: ParsingPrefs = {
  view: "spreads",
  metric: "dps",
  hidden: { dps: [], hps: [] },
  playerClass: "",
  playerSpec: "",
  playerSubSpec: "",
  bossByInstance: {},
}

export function parsingView(params: URLSearchParams): ParsingView {
  return params.get("view") === "spec" ? "spec" : "spreads"
}

export function parsingMetric(params: URLSearchParams): ParsingMetric {
  return params.get("metric") === "hps" ? "hps" : "dps"
}

/**
 * Key for a hidden spread row. A bare class hides every spec of that class;
 * `CLASS:Spec:SubSpec` hides one exact cohort.
 */
export function hiddenKey(playerClass: string, playerSpec?: string, playerSubSpec?: string): string {
  return playerSpec === undefined ? playerClass : `${playerClass}:${playerSpec}:${playerSubSpec ?? ""}`
}

export function parseHidden(raw: string | null): Set<string> {
  return new Set((raw ?? "").split(",").filter(Boolean))
}

export function isHidden(hidden: ReadonlySet<string>, playerClass: string, playerSpec: string, playerSubSpec: string) {
  return hidden.has(playerClass) || hidden.has(hiddenKey(playerClass, playerSpec, playerSubSpec))
}

/** Toggles one key, returning the new `hide` param value. */
export function toggleHidden(hidden: ReadonlySet<string>, key: string): string {
  const next = new Set(hidden)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return [...next].sort().join(",")
}

/** Reads stored prefs, tolerating missing or malformed fields. */
export function readParsingPrefs(raw: string | null): ParsingPrefs {
  if (!raw) return DEFAULT_PARSING_PREFS
  try {
    const parsed = JSON.parse(raw) as Partial<ParsingPrefs>
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : [])
    const str = (value: unknown) => (typeof value === "string" ? value : "")
    return {
      view: parsed.view === "spec" ? "spec" : "spreads",
      metric: parsed.metric === "hps" ? "hps" : "dps",
      hidden: { dps: list(parsed.hidden?.dps), hps: list(parsed.hidden?.hps) },
      playerClass: str(parsed.playerClass),
      playerSpec: str(parsed.playerSpec),
      playerSubSpec: str(parsed.playerSubSpec),
      bossByInstance:
        parsed.bossByInstance && typeof parsed.bossByInstance === "object" ? { ...parsed.bossByInstance } : {},
    }
  } catch {
    return DEFAULT_PARSING_PREFS
  }
}

/**
 * Fills a param-less URL from stored prefs. Returns null when the URL already
 * carries parsing params or there is nothing to restore.
 */
export function restoreParsingParams(
  params: URLSearchParams,
  prefs: ParsingPrefs,
  instance: string | null,
): URLSearchParams | null {
  if (PARSING_SELECTION_PARAMS.some((key) => params.has(key))) return null
  const next = new URLSearchParams(params)
  const set = (key: string, value: string) => {
    if (value) next.set(key, value)
  }
  if (prefs.view !== "spreads") set("view", prefs.view)
  if (prefs.metric !== "dps") set("metric", prefs.metric)
  set("hide", [...prefs.hidden[prefs.metric]].sort().join(","))
  set("class", prefs.playerClass)
  set("spec", prefs.playerSpec)
  set("sub_spec", prefs.playerSubSpec)
  if (instance) set("boss", prefs.bossByInstance[instance] ?? "")
  return next.toString() === params.toString() ? null : next
}

/** Folds the current URL into stored prefs. */
export function prefsFromParams(params: URLSearchParams, prev: ParsingPrefs, instance: string | null): ParsingPrefs {
  const metric = parsingMetric(params)
  const boss = params.get("boss") ?? ""
  return {
    view: parsingView(params),
    metric,
    hidden: { ...prev.hidden, [metric]: [...parseHidden(params.get("hide"))] },
    playerClass: params.get("class") ?? "",
    playerSpec: params.get("spec") ?? "",
    playerSubSpec: params.get("sub_spec") ?? "",
    bossByInstance: instance && boss ? { ...prev.bossByInstance, [instance]: boss } : prev.bossByInstance,
  }
}

/**
 * Shows or hides one exact spec. Revealing a spec of a fully hidden class
 * swaps the class key for keys of its other specs, so they stay hidden.
 */
export function setSpecHidden(
  hidden: ReadonlySet<string>,
  classSpecKeys: readonly string[],
  playerClass: string,
  key: string,
  hide: boolean,
): string {
  const next = new Set(hidden)
  if (hide) {
    next.add(key)
  } else {
    next.delete(key)
    if (next.delete(playerClass)) {
      for (const other of classSpecKeys) if (other !== key) next.add(other)
    }
  }
  return [...next].sort().join(",")
}
