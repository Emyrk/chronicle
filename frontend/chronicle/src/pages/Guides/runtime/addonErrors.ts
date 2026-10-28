/** Where an addon was when it stopped, reported by the panel worker with its error. */
export type AddonPhase = "startup" | "onEvent" | "onComplete" | "click"

export interface AddonErrorContext {
  phase?: AddonPhase
  /** Events delivered before the error, for onEvent failures. */
  events?: number
}

export interface AddonErrorExplanation {
  /** Short headline, e.g. "Too many UI changes at once". */
  title: string
  /** "main.lua line 151 · in onComplete" when known. */
  where?: string
  /** What happened, in plain words. */
  detail: string
  /** Concrete things to change. */
  fixes: string[]
  /** Section of the Addon API reference (/addons/api#…). */
  docs?: string
  /** The runtime's original message, kept for searching and for the assistant. */
  raw: string
}

const number = new Intl.NumberFormat("en-US")

const phaseLabel: Record<AddonPhase, string> = {
  startup: "while loading main.lua",
  onEvent: "in onEvent",
  onComplete: "in onComplete",
  click: "in a click handler",
}

function describeWhere(location: { file: string; line: string } | null, context: AddonErrorContext): string | undefined {
  const parts: string[] = []
  if (location) parts.push(`${location.file} line ${location.line}`)
  if (context.phase) {
    const events = context.phase === "onEvent" && context.events ? ` (event ${number.format(context.events)})` : ""
    parts.push(`${phaseLabel[context.phase]}${events}`)
  }
  return parts.length ? parts.join(" · ") : undefined
}

/**
 * Turns a terse runtime error ("main.lua:151: operation limit exceeded") into an explanation with
 * fixes. Shown in the preview and on instance pages, and returned to the workshop assistant.
 */
export function explainAddonError(message: string, context: AddonErrorContext = {}): AddonErrorExplanation {
  const match = /^([\w./-]+\.lua):(\d+): ([\s\S]*)$/.exec(message)
  const location = match ? { file: match[1], line: match[2] } : null
  const reason = match ? match[3] : message
  const where = describeWhere(location, context)
  const base = { raw: message, where }
  const perEvent = context.phase === "onEvent"

  if (/operation limit exceeded/.test(reason)) {
    return {
      ...base,
      title: "Too many UI changes at once",
      detail: perEvent
        ? "More than 2,000 UI changes were queued within 100 events. onEvent is creating or updating frames for every event."
        : "More than 2,000 UI changes were queued in one go. Every CreateFrame, SetPoint, SetSize, SetText, SetColor and similar call counts as one change.",
      fixes: perEvent
        ? ["Only update plain Lua tables in onEvent, then create and update frames once in onComplete.", "Create frames once and reuse them instead of creating new ones per event."]
        : ["Draw fewer rows, e.g. the top 25, or set fewer properties per row.", "Create frames once and update them with SetText/SetWidth instead of destroying and recreating them.", "Skip calls that set a value the frame already has."],
      docs: "limits",
    }
  }
  if (/instruction budget exceeded/.test(reason)) {
    return {
      ...base,
      title: "Lua ran too long in one step",
      detail: context.phase === "startup"
        ? "Loading main.lua used more than 250,000 Lua instructions."
        : "One callback used more than 100,000 Lua instructions. Each onEvent call, onComplete and click handler has its own budget.",
      fixes: perEvent
        ? ["Keep onEvent small: add to a table and return. Sort, format and draw in onComplete.", "Cache Chronicle.GetUnit results in a table instead of looking units up on every event.", "Avoid loops over all players or all rows inside onEvent."]
        : ["Look for nested loops or repeated sorting; sort once and reuse the result.", "Move setup work out of main.lua's top level into onComplete if it depends on events."],
      docs: "performance",
    }
  }
  if (/object limit exceeded/.test(reason)) {
    return {
      ...base,
      title: "Too many UI objects",
      detail: "More than 2,000 frames, font strings and textures were alive at once.",
      fixes: ["Show fewer rows, e.g. the top 25.", "Reuse frames instead of creating new ones on each redraw, or Destroy() the ones you no longer need."],
      docs: "limits",
    }
  }
  if (/exceeds string limit/.test(reason)) {
    return {
      ...base,
      title: "Text too long",
      detail: "A string passed to Chronicle was longer than 4 KiB.",
      fixes: ["Shorten the text or split it across several font strings."],
      docs: "limits",
    }
  }
  const maxEvents = /max_events \((\d+)\)/.exec(reason)
  if (maxEvents) {
    return {
      ...base,
      title: "Reached the addon's max_events",
      detail: `project.json sets "max_events": ${maxEvents[1]}, and this replay has more events than that.`,
      fixes: ["Raise or remove max_events in project.json. Chronicle has no event limit of its own."],
      docs: "project-json",
    }
  }
  if (/made no progress/.test(reason)) {
    return {
      ...base,
      title: "Addon stopped responding",
      detail: "The addon did not finish a batch of events for 10 seconds.",
      fixes: ["Look for very slow work in onEvent, such as building large strings or tables for every event."],
      docs: "performance",
    }
  }
  const stream = /panel stream '([^']+)' is not allowed/.exec(reason)
  if (stream) {
    return {
      ...base,
      title: "Stream not declared",
      detail: `The addon subscribed to "${stream[1]}", but project.json does not list it in streams.`,
      fixes: [`Add "${stream[1]}" to "streams" in project.json.`, "Check the stream name against the Addon API reference."],
      docs: "streams-and-fields",
    }
  }
  if (/text is not supported for frame/.test(reason)) {
    return {
      ...base,
      title: "Frames cannot show text",
      detail: "SetText was called on a Frame.",
      fixes: ['Create a font string for text: local label = frame:CreateFontString("id"), then label:SetText(...).'],
      docs: "drawing",
    }
  }
  const nilValue = /attempt to (call|index|perform arithmetic on|concatenate) a nil value(?: \((\w+) '([^']+)'\))?/.exec(reason)
  if (nilValue) {
    const name = nilValue[3] ? `${nilValue[2]} '${nilValue[3]}'` : "a value"
    return {
      ...base,
      title: "Used a value that is nil",
      detail: `Tried to ${nilValue[1]} ${name}, but it is nil.`,
      fixes: nilValue[1] === "call"
        ? ["Check the function name's spelling and that it exists in the Addon API reference.", "Methods use a colon: frame:SetText(...), not frame.SetText(...)."]
        : ["Check for nil before using it, e.g. Chronicle.GetUnit returns nil for unknown GUIDs.", "Make sure the variable is assigned before this line runs."],
      docs: "drawing",
    }
  }
  return {
    ...base,
    title: location ? "Lua error" : "Addon error",
    detail: reason,
    fixes: location ? [`Check ${location.file} around line ${location.line}.`] : [],
  }
}

/** Plain-text version for tool results and "ask the assistant" prompts. */
export function formatAddonError(explanation: AddonErrorExplanation): string {
  return [
    `${explanation.title}${explanation.where ? ` (${explanation.where})` : ""}: ${explanation.detail}`,
    ...explanation.fixes.map(fix => `- ${fix}`),
    `Original error: ${explanation.raw}`,
  ].join("\n")
}
