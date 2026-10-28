import type { EditorFiles } from "./editorFiles"

export const LUA_EDITOR_CAPABILITY = { id: "lua-editor", version: 1 } as const

/** A package path: project.json, README.md or any relative .lua path. Mirrors the server's edit_lua_file pattern. */
export type LuaToolFile = string
export type LuaFileEdit = { file: LuaToolFile; expectedRevision: number; content?: string; edits?: { oldText: string; newText: string }[] }

const toolFilePattern = /^(?:project\.json|README\.md|(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.lua)$/
// The working copy holds these files today. Directories and more .lua files only need a wider EditorFiles.
const fileKeys: Readonly<Record<string, keyof EditorFiles>> = { "project.json": "manifest", "README.md": "readme", "main.lua": "lua" }

/** The tool-facing view of the working copy, keyed by package path. */
export function workingCopyFiles(files: EditorFiles): Record<LuaToolFile, string> {
  return Object.fromEntries(Object.entries(fileKeys).map(([path, key]) => [path, files[key]]))
}

export function editorFileKey(file: LuaToolFile): keyof EditorFiles {
  const key = Object.hasOwn(fileKeys, file) ? fileKeys[file] : undefined
  if (!key) throw new Error(`${file} is not in the working copy. It has ${Object.keys(fileKeys).join(", ")}.`)
  return key
}

/** Mirrors the server's edit_lua_file schema; the browser never trusts model arguments. */
export function parseLuaFileEdit(value: unknown): LuaFileEdit {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid edit_lua_file arguments.")
  const input = value as Record<string, unknown>
  if (typeof input.file !== "string" || input.file.length > 200 || !toolFilePattern.test(input.file)) throw new Error("file must be project.json, README.md or a relative .lua path.")
  if (typeof input.expected_revision !== "number" || !Number.isInteger(input.expected_revision) || input.expected_revision < 0) {
    throw new Error("expected_revision is required.")
  }
  const hasContent = typeof input.content === "string" && input.content.length > 0
  const hasEdits = Array.isArray(input.edits) && input.edits.length > 0
  if (hasContent === hasEdits) throw new Error("Provide either content or edits.")
  const edits = hasEdits ? (input.edits as unknown[]).map(edit => {
    const item = edit as Record<string, unknown> | null
    if (!item || typeof item.old_text !== "string" || !item.old_text || typeof item.new_text !== "string") throw new Error("Each edit needs old_text and new_text.")
    return { oldText: item.old_text, newText: item.new_text }
  }) : undefined
  return { file: input.file, expectedRevision: input.expected_revision, ...(hasContent ? { content: input.content as string } : { edits }) }
}

/** Applies edits in order. Each old_text must match exactly once in the file as edited so far. */
export function applyLuaFileEdit(files: EditorFiles, edit: LuaFileEdit): EditorFiles {
  const key = editorFileKey(edit.file)
  let text = files[key]
  if (edit.content !== undefined) text = edit.content
  for (const [index, { oldText, newText }] of (edit.edits ?? []).entries()) {
    const first = text.indexOf(oldText)
    if (first < 0) throw new Error(`Edit ${index + 1}: old_text was not found in ${edit.file}.`)
    if (text.indexOf(oldText, first + 1) >= 0) throw new Error(`Edit ${index + 1}: old_text matches more than once in ${edit.file}; include more surrounding lines.`)
    text = text.slice(0, first) + newText + text.slice(first + oldText.length)
  }
  return { ...files, [key]: text }
}
