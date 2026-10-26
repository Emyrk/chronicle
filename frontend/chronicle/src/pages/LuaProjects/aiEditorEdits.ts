import { parseLuaProposal } from "./draftAuthor"

const encoder = new TextEncoder()
export const MAX_AI_EDIT_MESSAGE_BYTES = 32 * 1024
export const MAX_AI_EDIT_RESPONSE_BYTES = 256 * 1024

/** The entire user message, not just the Lua source, must fit the server's per-message limit. */
export function buildLuaEditMessage(source: string, instruction: string, projectName: string): string {
  if (!instruction.trim()) throw new Error("Describe the change you want first.")
  const message = `Edit the unsaved main.lua for the Lua panel ${JSON.stringify(projectName)}. Return only JSON with one main_lua string containing the complete revised source. Preserve unrelated code. Do not include a manifest, markdown or an explanation.\n\nInstruction:\n${instruction.trim()}\n\nCurrent main.lua:\n${source}`
  if (encoder.encode(message).length > MAX_AI_EDIT_MESSAGE_BYTES) {
    throw new Error("Lua source and instruction exceed the 32 KiB AI edit message limit. Shorten the source or instruction before retrying.")
  }
  return message
}

export type LuaEditSnapshot = { source: string; revisionToken: string | number; projectId: string; projectRevision: number }

/** Recheck immediately before invoking onApply, even when the request completed successfully. */
export function isLuaEditCurrent(snapshot: LuaEditSnapshot, current: LuaEditSnapshot): boolean {
  return snapshot.source === current.source && snapshot.revisionToken === current.revisionToken &&
    snapshot.projectId === current.projectId && snapshot.projectRevision === current.projectRevision
}

/** Bound streamed text by UTF-8 bytes before retaining it, then apply the existing strict JSON/source parser. */
export function createLuaEditResponse() {
  let text = ""
  let bytes = 0
  return {
    append(delta: string) {
      bytes += encoder.encode(delta).length
      if (bytes > MAX_AI_EDIT_RESPONSE_BYTES) throw new Error("AI response exceeds the 256 KiB limit.")
      text += delta
    },
    proposal() { return parseLuaProposal(text) },
  }
}
